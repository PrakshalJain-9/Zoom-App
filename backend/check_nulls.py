import sqlite3

conn = sqlite3.connect('/home/prakshal-jain/AntiGravityProjects/zoom-clone/backend/zoom_clone.db')
cursor = conn.cursor()
cursor.execute("SELECT id, display_name, audio_enabled, video_enabled, hand_raised, status FROM participants WHERE audio_enabled IS NULL OR video_enabled IS NULL OR hand_raised IS NULL OR status IS NULL")
rows = cursor.fetchall()
print(f"Found {len(rows)} rows with NULL values:")
for row in rows:
    print(row)
conn.close()
