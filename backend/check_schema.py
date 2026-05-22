import sqlite3

conn = sqlite3.connect('/home/prakshal-jain/AntiGravityProjects/zoom-clone/backend/zoom_clone.db')
cursor = conn.cursor()
cursor.execute("PRAGMA table_info(participants)")
columns = cursor.fetchall()
for col in columns:
    print(col)
conn.close()
