
from dataclasses import dataclass, field

from e2_dms.schema import TABLES, REQUIRED, UNIQUE_KEYS, FOREIGN_KEYS


@dataclass
class Issue:
    code: str
    table: str
    row: object
    message: str
    severity: str = "ERROR"


@dataclass
class Report:
    issues: list = field(default_factory=list)

    def add(self, code, table, row, message, severity="ERROR"):
        self.issues.append(
            Issue(code, table, row, message, severity)
        )

    @property
    def passed(self):
        return self.error_count == 0

    @property
    def error_count(self):
        return sum(
            1 for issue in self.issues
            if issue.severity == "ERROR"
        )

    @property
    def warning_count(self):
        return sum(
            1 for issue in self.issues
            if issue.severity == "WARNING"
        )


def check_nulls(df, table, required_cols, report):
    for col in required_cols:
        if col not in df.columns:
            report.add(
                "MISSING_COLUMN",
                table,
                -1,
                f"Column '{col}' is missing"
            )
            continue

        empty = (
            df[col].isna()
            | df[col].astype("string").str.strip().eq("")
        )

        for idx in df.index[empty]:
            report.add(
                "NULL_VALUE",
                table,
                idx,
                f"'{col}' is empty"
            )


def check_duplicates(
    df, table, cols,
    report,
    code="DUPLICATE_KEY",
    severity="ERROR"
):
    missing = [col for col in cols if col not in df.columns]

    if missing:
        report.add(
            "MISSING_COLUMN",
            table,
            -1,
            f"Cannot check duplicates, missing columns: {missing}"
        )
        return

    complete = df[cols].notna().all(axis=1)

    duplicates = (
        complete
        & df.duplicated(subset=cols, keep="first")
    )

    for idx in df.index[duplicates]:
        values = df.loc[idx, cols].tolist()

        report.add(
            code,
            table,
            idx,
            f"Duplicate on {cols}: {values}",
            severity
        )


def check_foreign_keys(tables, report):
    optional_assignments = {
        ("session", "faculty_id"),
        ("session", "room_id"),
        ("session", "slot_id"),
    }

    for child, col, parent, parent_col in FOREIGN_KEYS:

        if child not in tables or parent not in tables:
            continue

        child_df = tables[child]
        parent_df = tables[parent]

        if col not in child_df.columns or parent_col not in parent_df.columns:
            report.add(
                "MISSING_COLUMN",
                child,
                -1,
                f"Cannot check {col} -> {parent}.{parent_col}"
            )
            continue

        valid_reference = child_df[col].notna()

        if (child, col) in optional_assignments:
            valid_reference &= (
                child_df[col]
                .astype("string")
                .str.strip()
                .str.upper() != "TBD"
            )

        bad = (
            valid_reference
            & ~child_df[col].isin(parent_df[parent_col])
        )

        for idx in child_df.index[bad]:
            report.add(
                "FK_ORPHAN",
                child,
                idx,
                f"{col}={child_df.loc[idx, col]} "
                f"does not exist in {parent}.{parent_col}"
            )


def check_missing_tables(tables, report):
    for name in TABLES:
        if name not in tables:
            report.add(
                "MISSING_TABLE",
                name,
                -1,
                f"Required table '{name}' was not received"
            )


def run_all_checks(tables):
    report = Report()

    check_missing_tables(tables, report)

    for name, df in tables.items():

        if name not in REQUIRED or name not in UNIQUE_KEYS:
            report.add(
                "UNKNOWN_TABLE",
                name,
                -1,
                f"Table '{name}' is not defined in schema"
            )
            continue

        check_nulls(df, name, REQUIRED[name], report)

        check_duplicates(
            df,
            name,
            UNIQUE_KEYS[name],
            report
        )

    check_foreign_keys(tables, report)

    return report
