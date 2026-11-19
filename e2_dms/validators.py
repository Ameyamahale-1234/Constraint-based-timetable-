from dataclasses import dataclass, field


@dataclass
class Issue:
    code: str          # short label, e.g. "NULL_VALUE"
    table: str
    row: int           # row position in the table
    message: str
    severity: str = "ERROR"


@dataclass
class Report:
    issues: list = field(default_factory=list)

    def add(self, code, table, row, message, severity="ERROR"):
        self.issues.append(Issue(code, table, row, message, severity))

    @property
    def passed(self):
        return not any(i.severity == "ERROR" for i in self.issues)


def check_nulls(df, table, required_cols, report):
    for col in required_cols:
        if col not in df.columns:
            report.add("MISSING_COLUMN", table, -1, f"Column '{col}' is missing")
            continue
        empty = df[col].isna() | (df[col].astype(str).str.strip() == "")
        for idx in df[empty].index:
            report.add("NULL_VALUE", table, int(idx), f"'{col}' is empty")