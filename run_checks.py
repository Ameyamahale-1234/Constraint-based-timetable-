
from e2_dms.db import fetch
from e2_dms.schema import TABLES
from e2_dms.validators import run_all_checks

# Fetch all nine tables from Supabase
tables = {}

for name, table_name in TABLES.items():
    print(f"Fetching {table_name}...")
    tables[name] = fetch(table_name)

# Run all E2 validation checks
report = run_all_checks(tables)

# Display validation results
print("\n========== E2 VALIDATION REPORT ==========")

for issue in report.issues:
    print(
        f"[{issue.severity}] "
        f"{issue.code} | "
        f"Table: {issue.table} | "
        f"Row: {issue.row} | "
        f"{issue.message}"
    )

print("\n========== SUMMARY ==========")
print("Total issues:", len(report.issues))
print("Errors:", report.error_count)
print("Warnings:", report.warning_count)
print("Validation status:", "PASSED" if report.passed else "FAILED")
