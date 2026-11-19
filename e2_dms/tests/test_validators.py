import pandas as pd
from e2_dms.validators import Report, check_nulls


def test_finds_empty_value():
    df = pd.DataFrame({"faculty_id": [1, 2], "faculty_name": ["A", None]})
    r = Report()
    check_nulls(df, "Faculty", ["faculty_name"], r)
    assert len(r.issues) == 1
    assert r.passed is False


def test_clean_data_passes():
    df = pd.DataFrame({"faculty_id": [1], "faculty_name": ["A"]})
    r = Report()
    check_nulls(df, "Faculty", ["faculty_name"], r)
    assert r.issues == []
    assert r.passed is True


def test_blank_string_counts_as_empty():
    df = pd.DataFrame({"faculty_name": ["  "]})
    r = Report()
    check_nulls(df, "Faculty", ["faculty_name"], r)
    assert len(r.issues) == 1