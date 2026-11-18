from e2_dms.db import fetch

tables = ["course", "course_division", "course_faculty", "department", "division",
          "faculty", "room", "time_slot", "timetable"]

for t in tables:
    try:
        df = fetch(t)
        print(f"{t:12} rows={df.shape[0]:4}  columns={list(df.columns)}")
    except Exception as e:
        print(f"{t:12} FAILED -> {e}")