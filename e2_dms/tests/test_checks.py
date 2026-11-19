
import pandas as pd

from e2_dms.validators import (
    Report,
    check_duplicates,
    check_foreign_keys,
)


def test_duplicate_key_found():
    df = pd.DataFrame({
        "faculty_id": [1, 2, 2]
    })

    report = Report()
    check_duplicates(df, "faculty", ["faculty_id"], report)

    assert len(report.issues) == 1
    assert report.issues[0].code == "DUPLICATE_KEY"
    assert report.passed is False


def test_no_duplicates():
    df = pd.DataFrame({
        "faculty_id": [1, 2, 3]
    })

    report = Report()
    check_duplicates(df, "faculty", ["faculty_id"], report)

    assert report.issues == []
    assert report.passed is True


def test_warning_does_not_fail_gate():
    df = pd.DataFrame({
        "email": ["a@x.com", "a@x.com"]
    })

    report = Report()

    check_duplicates(
        df,
        "faculty",
        ["email"],
        report,
        code="DUPLICATE_EMAIL",
        severity="WARNING"
    )

    assert len(report.issues) == 1
    assert report.issues[0].code == "DUPLICATE_EMAIL"
    assert report.issues[0].severity == "WARNING"
    assert report.passed is True


def test_orphan_foreign_key_found():
    tables = {
        "faculty": pd.DataFrame({
            "faculty_id": [1, 2]
        }),
        "session": pd.DataFrame({
            "faculty_id": [1, 99]
        }),
    }

    report = Report()
    check_foreign_keys(tables, report)

    assert len(report.issues) == 1
    assert report.issues[0].code == "FK_ORPHAN"
    assert report.issues[0].table == "session"


def test_valid_foreign_keys_pass():
    tables = {
        "faculty": pd.DataFrame({
            "faculty_id": [1, 2]
        }),
        "session": pd.DataFrame({
            "faculty_id": [1, 2, 1]
        }),
    }

    report = Report()
    check_foreign_keys(tables, report)

    assert report.issues == []
    assert report.passed is True
