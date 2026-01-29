#!/usr/bin/env python3
"""
Secure keypair storage with PBKDF2 encryption.

This module provides encrypted at-rest storage for the server's private key,
protecting it from unauthorized access if the filesystem is compromised.
"""
import os
import json
import base64
import hashlib
import getpass
import logging
from pathlib import Path
from typing import Optional, Tuple

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from solders.keypair import Keypair

logger = logging.getLogger("keystore")

# Constants
KEYSTORE_VERSION = 1
PBKDF2_ITERATIONS = 600_000  # OWASP recommendation for 2024
SALT_SIZE = 32


class KeystoreError(Exception):
    """Base exception for keystore operations."""
    pass


class KeystoreNotFoundError(KeystoreError):
    """Keystore file does not exist."""
    pass


class KeystoreDecryptionError(KeystoreError):
    """Failed to decrypt keystore (wrong password or corrupted)."""
    pass


class KeystoreVersionError(KeystoreError):
    """Unsupported keystore version."""
    pass


def _derive_key(password: str, salt: bytes) -> bytes:
    """Derive encryption key from password using PBKDF2."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    return base64.urlsafe_b64encode(kdf.derive(password.encode()))


def create_keystore(
    keypair: Keypair,
    keystore_path: str,
    password: str
) -> None:
    """
    Create an encrypted keystore file from a Keypair.

    Args:
        keypair: The Solana keypair to store
        keystore_path: Path to save the encrypted keystore
        password: Password for encryption
    """
    # Generate random salt
    salt = os.urandom(SALT_SIZE)

    # Derive encryption key
    key = _derive_key(password, salt)
    fernet = Fernet(key)

    # Get the secret key bytes (first 32 bytes of the full keypair)
    secret_bytes = bytes(keypair)[:32]

    # Encrypt the secret key
    encrypted_secret = fernet.encrypt(secret_bytes)

    # Create keystore structure
    keystore_data = {
        'version': KEYSTORE_VERSION,
        'salt': base64.b64encode(salt).decode('utf-8'),
        'pubkey': str(keypair.pubkey()),
        'encrypted_secret': base64.b64encode(encrypted_secret).decode('utf-8'),
        'kdf': {
            'algorithm': 'pbkdf2-sha256',
            'iterations': PBKDF2_ITERATIONS
        }
    }

    # Write to file with restricted permissions
    keystore_path = Path(keystore_path)
    keystore_path.write_text(json.dumps(keystore_data, indent=2))

    # Set file permissions to owner read/write only (600)
    keystore_path.chmod(0o600)

    logger.info(f"Keystore created at {keystore_path} for wallet {keypair.pubkey()}")


def load_keystore(keystore_path: str, password: str) -> Keypair:
    """
    Load and decrypt a keypair from the keystore.

    Args:
        keystore_path: Path to the encrypted keystore file
        password: Password for decryption

    Returns:
        The decrypted Keypair

    Raises:
        KeystoreNotFoundError: If keystore file doesn't exist
        KeystoreDecryptionError: If decryption fails (wrong password)
        KeystoreVersionError: If keystore version is unsupported
    """
    keystore_path = Path(keystore_path)

    if not keystore_path.exists():
        raise KeystoreNotFoundError(f"Keystore not found at {keystore_path}")

    try:
        keystore_data = json.loads(keystore_path.read_text())
    except json.JSONDecodeError as e:
        raise KeystoreError(f"Invalid keystore format: {e}")

    # Check version
    version = keystore_data.get('version', 0)
    if version != KEYSTORE_VERSION:
        raise KeystoreVersionError(f"Unsupported keystore version: {version}")

    # Extract components
    salt = base64.b64decode(keystore_data['salt'])
    encrypted_secret = base64.b64decode(keystore_data['encrypted_secret'])
    expected_pubkey = keystore_data['pubkey']

    # Derive decryption key
    key = _derive_key(password, salt)
    fernet = Fernet(key)

    try:
        secret_bytes = fernet.decrypt(encrypted_secret)
    except InvalidToken:
        raise KeystoreDecryptionError("Failed to decrypt keystore - incorrect password")

    # Reconstruct keypair from secret key
    keypair = Keypair.from_seed(secret_bytes)

    # Verify public key matches
    if str(keypair.pubkey()) != expected_pubkey:
        raise KeystoreDecryptionError("Keypair verification failed - pubkey mismatch")

    logger.info(f"Keypair loaded from keystore: {keypair.pubkey()}")
    return keypair


def migrate_plaintext_to_keystore(
    plaintext_path: str,
    keystore_path: str,
    password: str,
    delete_plaintext: bool = False
) -> Keypair:
    """
    Migrate a plaintext keypair.json to encrypted keystore.

    Args:
        plaintext_path: Path to existing keypair.json
        keystore_path: Path for new encrypted keystore
        password: Password for encryption
        delete_plaintext: If True, securely delete the plaintext file after migration

    Returns:
        The loaded Keypair
    """
    plaintext_path = Path(plaintext_path)

    if not plaintext_path.exists():
        raise FileNotFoundError(f"Plaintext keypair not found: {plaintext_path}")

    # Load plaintext keypair
    with open(plaintext_path, 'r') as f:
        kp_data = json.load(f)

    keypair = Keypair.from_bytes(kp_data)

    # Create encrypted keystore
    create_keystore(keypair, keystore_path, password)

    # Optionally delete plaintext file
    if delete_plaintext:
        secure_delete(plaintext_path)
        logger.info(f"Securely deleted plaintext keypair: {plaintext_path}")

    return keypair


def secure_delete(file_path: Path) -> None:
    """
    Attempt to securely delete a file by overwriting before deletion.
    Note: This is best-effort on modern filesystems (SSD/journaling).
    """
    if not file_path.exists():
        return

    file_size = file_path.stat().st_size

    # Overwrite with random data 3 times
    for _ in range(3):
        with open(file_path, 'wb') as f:
            f.write(os.urandom(file_size))
            f.flush()
            os.fsync(f.fileno())

    # Overwrite with zeros
    with open(file_path, 'wb') as f:
        f.write(b'\x00' * file_size)
        f.flush()
        os.fsync(f.fileno())

    # Delete the file
    file_path.unlink()


def keystore_exists(keystore_path: str) -> bool:
    """Check if a keystore file exists."""
    return Path(keystore_path).exists()


def get_keystore_info(keystore_path: str) -> Optional[dict]:
    """
    Get basic info about a keystore without decrypting.

    Returns:
        Dict with version and pubkey, or None if file doesn't exist
    """
    keystore_path = Path(keystore_path)

    if not keystore_path.exists():
        return None

    try:
        keystore_data = json.loads(keystore_path.read_text())
        return {
            'version': keystore_data.get('version'),
            'pubkey': keystore_data.get('pubkey'),
            'kdf': keystore_data.get('kdf', {})
        }
    except:
        return None


def load_keypair_with_fallback(
    keystore_path: str,
    plaintext_path: str,
    password: Optional[str] = None
) -> Tuple[Optional[Keypair], str]:
    """
    Attempt to load keypair from keystore first, falling back to plaintext.

    This supports migration from plaintext to encrypted storage.

    Args:
        keystore_path: Path to encrypted keystore
        plaintext_path: Path to plaintext keypair.json (fallback)
        password: Password for keystore (required if keystore exists)

    Returns:
        Tuple of (Keypair or None, wallet_address or "Unknown")
    """
    # Try encrypted keystore first
    if keystore_exists(keystore_path):
        if not password:
            password = os.getenv('TACTIX_KEYSTORE_PASSWORD', '')
            if not password:
                logger.warning("Keystore exists but no password provided (set TACTIX_KEYSTORE_PASSWORD)")
                return None, "Unknown"

        try:
            keypair = load_keystore(keystore_path, password)
            return keypair, str(keypair.pubkey())
        except KeystoreDecryptionError as e:
            logger.error(f"Keystore decryption failed: {e}")
            return None, "Unknown"
        except Exception as e:
            logger.error(f"Keystore error: {e}")
            return None, "Unknown"

    # Fallback to plaintext (with warning)
    if Path(plaintext_path).exists():
        logger.warning(
            "Loading keypair from PLAINTEXT file. "
            "Run 'python -m services.keystore migrate' to encrypt it."
        )
        try:
            with open(plaintext_path, 'r') as f:
                kp_data = json.load(f)
            keypair = Keypair.from_bytes(kp_data)
            return keypair, str(keypair.pubkey())
        except Exception as e:
            logger.error(f"Failed to load plaintext keypair: {e}")
            return None, "Unknown"

    return None, "Unknown"


# CLI interface for keystore management
if __name__ == '__main__':
    import sys

    BASE_DIR = Path(__file__).parent.parent
    KEYSTORE_PATH = BASE_DIR / '.keystore.enc'
    PLAINTEXT_PATH = BASE_DIR / 'keypair.json'

    def cmd_migrate():
        """Migrate plaintext keypair to encrypted keystore."""
        if not PLAINTEXT_PATH.exists():
            print(f"Error: No plaintext keypair found at {PLAINTEXT_PATH}")
            sys.exit(1)

        if KEYSTORE_PATH.exists():
            print(f"Keystore already exists at {KEYSTORE_PATH}")
            response = input("Overwrite? [y/N]: ").strip().lower()
            if response != 'y':
                print("Aborted.")
                sys.exit(0)

        print("\nCreate a strong password for your keystore.")
        print("This password will be required to start TacTix.\n")

        password = getpass.getpass("Enter password: ")
        password_confirm = getpass.getpass("Confirm password: ")

        if password != password_confirm:
            print("Error: Passwords do not match")
            sys.exit(1)

        if len(password) < 12:
            print("Warning: Password should be at least 12 characters")
            response = input("Continue anyway? [y/N]: ").strip().lower()
            if response != 'y':
                sys.exit(0)

        print("\n")

        delete_plaintext = input("Delete plaintext keypair.json after migration? [y/N]: ").strip().lower() == 'y'

        try:
            keypair = migrate_plaintext_to_keystore(
                str(PLAINTEXT_PATH),
                str(KEYSTORE_PATH),
                password,
                delete_plaintext=delete_plaintext
            )
            print(f"\n Keystore created successfully!")
            print(f"   Path: {KEYSTORE_PATH}")
            print(f"   Wallet: {keypair.pubkey()}")
            print(f"\nSet TACTIX_KEYSTORE_PASSWORD in your .env or enter at startup.")
        except Exception as e:
            print(f"Error: {e}")
            sys.exit(1)

    def cmd_info():
        """Show keystore info."""
        info = get_keystore_info(str(KEYSTORE_PATH))
        if info:
            print(f"Keystore: {KEYSTORE_PATH}")
            print(f"Version: {info['version']}")
            print(f"Wallet: {info['pubkey']}")
            print(f"KDF: {info['kdf']}")
        else:
            print(f"No keystore found at {KEYSTORE_PATH}")
            if PLAINTEXT_PATH.exists():
                print(f"Plaintext keypair.json exists - run 'migrate' to encrypt it")

    def cmd_verify():
        """Verify keystore can be decrypted."""
        if not KEYSTORE_PATH.exists():
            print(f"No keystore found at {KEYSTORE_PATH}")
            sys.exit(1)

        password = getpass.getpass("Enter keystore password: ")

        try:
            keypair = load_keystore(str(KEYSTORE_PATH), password)
            print(f" Keystore verified successfully!")
            print(f"   Wallet: {keypair.pubkey()}")
        except KeystoreDecryptionError:
            print(" Decryption failed - incorrect password")
            sys.exit(1)
        except Exception as e:
            print(f" Error: {e}")
            sys.exit(1)

    def cmd_help():
        print("TacTix Keystore Manager")
        print("")
        print("Commands:")
        print("  migrate  - Convert plaintext keypair.json to encrypted keystore")
        print("  info     - Show keystore information")
        print("  verify   - Test keystore password")
        print("  help     - Show this help")

    commands = {
        'migrate': cmd_migrate,
        'info': cmd_info,
        'verify': cmd_verify,
        'help': cmd_help
    }

    if len(sys.argv) < 2:
        cmd_help()
        sys.exit(0)

    cmd = sys.argv[1]
    if cmd in commands:
        commands[cmd]()
    else:
        print(f"Unknown command: {cmd}")
        cmd_help()
        sys.exit(1)
