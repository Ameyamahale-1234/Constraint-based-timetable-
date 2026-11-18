import os
import pandas as pd
import certifi
from dotenv import load_dotenv
from supabase import create_client

# If SSL_CERT_FILE points to a file that doesn't exist, use Python's own certificates
_cert = os.environ.get("SSL_CERT_FILE")
if _cert and not os.path.exists(_cert):
    os.environ["SSL_CERT_FILE"] = certifi.where()

load_dotenv()

sb = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_KEY"],
)


def fetch(table: str) -> pd.DataFrame:
    """Download a whole table from Supabase as a pandas DataFrame."""
    rows, start, page = [], 0, 1000
    while True:
        r = sb.table(table).select("*").range(start, start + page - 1).execute()
        rows += r.data
        if len(r.data) < page:
            break
        start += page
    return pd.DataFrame(rows)