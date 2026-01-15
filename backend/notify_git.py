#!/usr/bin/env python3
"""Script to notify Discord about the latest Git commit."""
import subprocess
import sys
import os

# Ensure we can import from services
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from services.notifications import notify_git_commit
except ImportError:
    print("Error: Could not import notification service.")
    sys.exit(1)

def get_git_info():
    """Retrieve details about the latest commit."""
    try:
        author = subprocess.check_output(['git', 'log', '-1', '--format=%an'], encoding='utf-8').strip()
        branch = subprocess.check_output(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], encoding='utf-8').strip()
        commit_hash = subprocess.check_output(['git', 'rev-parse', 'HEAD'], encoding='utf-8').strip()
        message = subprocess.check_output(['git', 'log', '-1', '--format=%B'], encoding='utf-8').strip()
        summary = subprocess.check_output(['git', 'show', '--stat', '--oneline', '-1'], encoding='utf-8').split('\n', 1)[1].strip()
        return author, branch, commit_hash, message, summary
    except Exception as e:
        print(f"Git Info Error: {e}")
        return None

if __name__ == "__main__":
    info = get_git_info()
    if info:
        author, branch, commit_hash, message, summary = info
        notify_git_commit(author, branch, commit_hash, message, summary)
        print(f"✅ Discord notification sent for commit {commit_hash[:8]}")
    else:
        print("❌ Failed to retrieve Git info.")
