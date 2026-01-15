import sqlite3
import json

db_path = "backend/tactix_data.db"
conn = sqlite3.connect(db_path)

targets = [
    ("EZ3q7RMhCEn1iVqR7VaGUq2MmREVPU98MQPexMg4U8cq", "TEST=1", "active", '["test"]', '{"scale_factor": 0.1, "max_per_trade": 1.0}', "{}", "2026-01-10 13:15:46"),
    ("8re8an4H7FHYYWJq6B8EAzCvoT1aBR1vKgFYtZyGA5JG", "TEST-2", "active", "[]", '{"scale_factor": 0.1, "max_per_trade": 1}', "{}", "2026-01-10 14:09:49"),
    ("4cMuVSYzoJgR8sRRreuAxGxxUeUBEcx7aN6wnb34szgD", "BigFIsh", "active", "[]", '{"scale_factor": 0.1, "max_per_trade": 1}', "{}", "2026-01-10 14:56:28"),
    ("3KE2VpqdM3Ac3U2zMJAK3MMfDdQN8mKrhKY71ichegKM", "45.6", "active", "[]", '{"scale_factor": 0.1, "max_per_trade": 1}', "{}", "2026-01-10 15:09:48"),
    ("GEe8eQ1cBH8cXX2Nba4xFhKMpH9KxSre3c3uMVD5yXRJ", "HighVol", "active", "[]", '{"scale_factor": 0.1, "max_per_trade": 1}', "{}", "2026-01-10 16:50:03"),
    ("2FpCgpxqitrybpy4gUnZX7LAsR7Qp4NBndz3XCLsbdMN", "bigfish II", "active", "[]", '{"scale_factor": 0.1, "max_per_trade": 1.0}', "{}", "2026-01-13 18:08:33"),
    ("E7jsBpG7RPNrvoKvv8QjZ8XasB4b83uvRbWTMjeC9Wx6", "decent", "active", "[]", '{"scale_factor": 0.1, "max_per_trade": 1.0}', "{}", "2026-01-13 18:11:41"),
    ("6Dz21CzQg9Lr8ffrWehvTWnFo2VcDsyew5fLWwC3CMpv", "42-18", "active", "[]", '{"scale_factor": 0.1, "max_per_trade": 1.0}', "{}", "2026-01-15 12:18:36"),
    ("3BZLz7PB1Bxz5aCdSZpKw3vxNuogGWX1iLLL8Jt6RZXY", "68", "active", "[]", '{"scale_factor": 0.1, "max_per_trade": 1.0}', "{}", "2026-01-15 12:21:01"),
    ("H3CcASXoqwgANwqbqFzLATCzKT2M59LcDMSE1KfVuVUG", "AVICI-accumulator", "active", "[]", '{"scale_factor": 0.1, "max_per_trade": 1.0}', "{}", "2026-01-15 12:59:37"),
    ("2uQEWNCas4zAAj1u8PVy5Pbgc9LaBqanjMn8TsjfWc8P", "48.17", "active", "[]", '{"scale_factor": 0.1, "max_per_trade": 1.0}', "{}", "2026-01-15 13:07:29"),
    ("22nEYkk1Urgv5Rwu2RYSLnDfsYPqdDAwUNAjyTTMpxoX", "63.45", "active", "[]", '{"scale_factor": 0.1, "max_per_trade": 1.0}', "{}", "2026-01-15 13:15:21"),
    ("ATiFipBzC4NWJ1YZkB5UfdCnwA1r6mSDtWtVpmPuKW5c", "78.8", "active", "[]", '{"scale_factor": 0.1, "max_per_trade": 1.0}', "{}", "2026-01-15 13:52:41"),
    ("7gEQ6syDZmyPE4JdfJm4qatawnDqvqdh6i8jJjCXio6h", "Unknown", "active", "[]", '{"scale_factor": 0.1, "max_per_trade": 1.0}', "{}", "2026-01-15 14:33:37"),
    ("HJK19cmNhxMh7NMdQpUtFRZtGwbiUxUS1xQ4aXL6AsWv", "RNGR", "active", "[]", '{"scale_factor": 0.1, "max_per_trade": 1.0}', "{}", "2026-01-15 14:50:57"),
]

cursor = conn.cursor()
cursor.executemany(
    "INSERT INTO targets (address, alias, status, tags, config_json, performance_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    targets
)
conn.commit()
conn.close()
print("Restored 15 targets successfully.")
