from e2_dms.db import fetch
from e2_dms.validators import Report, check_nulls

report = Report()

faculty = fetch("faculty")
check_nulls(faculty, "faculty", ["faculty_id", "faculty_name"], report)

for i in report.issues:
    print(i)
print("PASSED" if report.passed else "FAILED", "-", len(report.issues), "issues")