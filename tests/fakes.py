"""A pool that records SQL instead of running it.

The deployed Postgres is the only one this project has, and a test must never be
able to reach it. These fakes let the repository and the API be tested for the SQL
they issue and the rules they enforce, on any machine, with nothing running.

Rows are keyed by a fragment of the query — `"FROM members"` — because the tests
care which table was read, not how the SELECT was spelled.
"""
from __future__ import annotations


def flatten(query: str) -> str:
    """Collapse a multi-line SQL string so tests can match on one line."""
    return " ".join(query.split())


class FakeConnection:
    def __init__(self, rows: dict | None = None, scalars: dict | None = None,
                 results: dict | None = None):
        self.rows = rows or {}
        self.scalars = scalars or {}
        # asyncpg answers a write with a tag like "UPDATE 1"; callers read the count
        # off it. Default to one row so the common case needs no setup.
        self.results = results or {}
        self.executed: list[tuple[str, tuple]] = []
        self.executed_many: list[tuple[str, list]] = []

    def _match(self, table: dict, query: str):
        """The most specific fragment wins.

        Several queries now touch the same table, so `"FROM circle_members"` and
        `"count(*) AS people FROM circle_members"` can both match one query. Longest
        match makes the answer depend on which fragment says more, not on the order
        the test happened to write its keys in.
        """
        best_fragment, best_value = None, None
        for fragment, value in table.items():
            if fragment in query and (
                best_fragment is None or len(fragment) > len(best_fragment)
            ):
                best_fragment, best_value = fragment, value
        return best_value

    async def fetch(self, query: str, *args):
        self.executed.append((flatten(query), args))
        return self._match(self.rows, query) or []

    async def fetchrow(self, query: str, *args):
        self.executed.append((flatten(query), args))
        found = self._match(self.rows, query)
        return found[0] if found else None

    async def fetchval(self, query: str, *args):
        self.executed.append((flatten(query), args))
        return self._match(self.scalars, query)

    async def execute(self, query: str, *args):
        self.executed.append((flatten(query), args))
        found = self._match(self.results, query)
        return "OK 1" if found is None else found

    async def executemany(self, query: str, args):
        self.executed_many.append((flatten(query), list(args)))

    def transaction(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    @property
    def sql(self) -> list[str]:
        """Every query issued, single-shot and executemany alike."""
        return [q for q, _ in self.executed] + [q for q, _ in self.executed_many]

    def issued(self, fragment: str) -> bool:
        return any(fragment in query for query in self.sql)

    def args_for(self, fragment: str) -> tuple:
        for query, args in self.executed:
            if fragment in query:
                return args
        raise AssertionError(f"no query contained {fragment!r}; saw {self.sql}")


class FakePool:
    def __init__(self, connection: FakeConnection):
        self.connection = connection

    def acquire(self):
        return self

    async def __aenter__(self):
        return self.connection

    async def __aexit__(self, *exc):
        return False
