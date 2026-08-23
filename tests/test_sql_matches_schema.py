"""Check the SQL the repository issues against the schema the migrations build.

The rest of the suite runs against a fake pool. That proves which SQL is sent and
which rules are enforced, but never that Postgres would accept the query — the live
database is the only one this project has, and a test must not be able to reach it.

So the migrations are parsed into a schema and every query in the repository is
parsed against it. It does not run anything. What it catches is the realistic
failure: a column renamed in a migration and missed in a query, or a table that was
never created, shipping green and breaking every screen at once.
"""
from __future__ import annotations

import pathlib
import re

import pytest
import sqlglot
from sqlglot import exp

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPOSITORY = ROOT / "app" / "repository.py"
MIGRATIONS = ROOT / "migrations"

# asyncpg's $1 placeholders read as the opening of a dollar-quoted string to
# sqlglot's tokenizer. Renaming them keeps the parser on the query itself.
PLACEHOLDER = re.compile(r"\$(\d+)")
TRIPLE_QUOTED = re.compile(r'"""(\s*(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]*?)"""')
SINGLE_LINE = re.compile(r'"((?:SELECT|INSERT|UPDATE|DELETE)[^"]*)"')
COLUMN_CONSTANT = re.compile(r'^(_[A-Z_]+) = "([^"]+)"', re.M)


def build_schema() -> dict[str, set[str]]:
    """Every table the migrations create, with the columns they give it."""
    schema: dict[str, set[str]] = {}
    for path in sorted(MIGRATIONS.glob("*.sql")):
        for statement in sqlglot.parse(path.read_text(), dialect="postgres"):
            if statement is None:
                continue
            if isinstance(statement, exp.Create) and statement.args.get("kind") == "TABLE":
                table = statement.this.this
                if table is not None:
                    schema.setdefault(table.name, set()).update(
                        definition.this.name
                        for definition in statement.find_all(exp.ColumnDef)
                    )
            elif isinstance(statement, exp.Alter):
                for action in statement.args.get("actions") or []:
                    if isinstance(action, exp.ColumnDef):
                        schema.setdefault(statement.this.name, set()).add(action.this.name)
    return schema


def repository_queries() -> list[str]:
    source = REPOSITORY.read_text()
    constants = dict(COLUMN_CONSTANT.findall(source))
    found = [m.group(1) for m in TRIPLE_QUOTED.finditer(source)]
    found += [m.group(1) for m in SINGLE_LINE.finditer(source)]
    queries = []
    for raw in found:
        query = raw.strip()
        for name, value in constants.items():
            query = query.replace("{" + name + "}", value)
        assert "{" not in query, f"unsubstituted f-string in: {query[:80]}"
        queries.append(PLACEHOLDER.sub(r":p\1", query))
    return queries


SCHEMA = build_schema()
QUERIES = repository_queries()


def test_the_migrations_build_the_tables_the_app_expects():
    assert {"members", "circles", "circle_members", "day_records"} <= set(SCHEMA)
    assert "is_child" in SCHEMA["members"]


def test_every_query_was_found():
    """A regex that quietly stops matching would make this whole file vacuous."""
    assert len(QUERIES) > 40, f"only found {len(QUERIES)} queries; the extraction broke"


@pytest.mark.parametrize("query", QUERIES, ids=lambda q: " ".join(q.split())[:60])
def test_query_only_touches_columns_the_migrations_create(query: str):
    tree = sqlglot.parse_one(query, dialect="postgres")

    aliases, tables = {}, []
    for table in tree.find_all(exp.Table):
        tables.append(table.name)
        if table.alias:
            aliases[table.alias] = table.name

    unknown_tables = [name for name in tables if name not in SCHEMA]
    assert not unknown_tables, f"no migration creates {unknown_tables}"

    anywhere = set().union(*(SCHEMA[name] for name in tables)) if tables else set()
    for column in tree.find_all(exp.Column):
        if not column.name or column.name == "*":
            continue
        owner = aliases.get(column.table, column.table)
        allowed = SCHEMA.get(owner, anywhere) if owner else anywhere
        assert column.name in allowed, (
            f"{owner or 'query'}.{column.name} is not a column any migration creates"
        )
