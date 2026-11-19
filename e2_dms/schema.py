
# --------------------------------------------------
# DATABASE TABLES
# --------------------------------------------------

TABLES = {
    "department": "department",
    "batch": "batch",
    "course": "course",
    "division": "division",
    "faculty": "faculty",
    "room": "room",
    "session": "session",
    "time_slot": "time_slot",
}


# --------------------------------------------------
# REQUIRED COLUMNS
# --------------------------------------------------

REQUIRED = {
    "department": [
        "dept_id",
        "dept_code",
        "dept_name",
    ],

    "batch": [
        "batch_id",
        "batch_type",
        "student_count",
    ],

    "course": [
        "course_id",
        "course_name",
        "course_type",
        "is_elective",
        "required_room_type",
        "credits",
        "required_weekly_slots",
        "duration_per_period",
        "dept_id",
    ],

    "division": [
        "division_id",
        "division_name",
        "semester",
        "year",
        "student_count",
        "dept_id",
    ],

    "faculty": [
        "faculty_id",
        "faculty_name",
        "designation",
        "dept_id",
        "max_weekly_slots",
        "max_daily_slots",
    ],

    "room": [
        "room_id",
        "room_name",
        "room_type",
        "capacity",
    ],

    "session": [
        "session_id",
        "course_id",
        "division_id",
        "batch_id",
        "duration_per_period",
        "required_room_type",
        "faculty_id",
        "room_id",
        "slot_id",
    ],

    "time_slot": [
        "slot_id",
        "day",
        "start_time",
        "end_time",
        "slot_type",
        "class_hour_index",
    ],
}


# --------------------------------------------------
# UNIQUE KEYS
# --------------------------------------------------

UNIQUE_KEYS = {
    "department": ["dept_id"],
    "batch": ["batch_id"],
    "course": ["course_id"],
    "division": ["division_id"],
    "faculty": ["faculty_id"],
    "room": ["room_id"],
    "session": ["session_id"],
    "time_slot": ["slot_id"],
}


# --------------------------------------------------
# SESSION KEY
# --------------------------------------------------

# Temporary compatibility with the existing validators.py.
# The old timetable composite-key check must be removed
# when we update validators.py.

TIMETABLE_SESSION_KEY = ["session_id"]


# --------------------------------------------------
# FOREIGN KEY RELATIONSHIPS
# --------------------------------------------------

FOREIGN_KEYS = [

    # Faculty -> Department
    ("faculty", "dept_id", "department", "dept_id"),

    # Course -> Department
    ("course", "dept_id", "department", "dept_id"),

    # Division -> Department
    ("division", "dept_id", "department", "dept_id"),

    # Session -> Course
    ("session", "course_id", "course", "course_id"),

    # Session -> Division
    ("session", "division_id", "division", "division_id"),

    # Session -> Batch
    ("session", "batch_id", "batch", "batch_id"),

    # Session -> Faculty
    ("session", "faculty_id", "faculty", "faculty_id"),

    # Session -> Room
    ("session", "room_id", "room", "room_id"),

    # Session -> Time Slot
    ("session", "slot_id", "time_slot", "slot_id"),
]
