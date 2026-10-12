# Relational Data Reference

## Table indexes

Define indexes under `postgres.tables.<table>.indices`. Each named index specifies
a `column`. Indexes use B-tree by default; set `gin: true` for GIN or `gist: true`
for GiST.

```yaml
postgres:
  tables:
    entries:
      type: application/json;type=entry
      columns:
        title: TEXT
        tags: TEXT[]
      indices:
        entries_title:
          column: title
          gist: true
        entries_tags:
          column: tags
          gin: true
```

The indexed column must have a default PostgreSQL operator class for the selected
index method. For the `TEXT` GiST example, install the
[`btree_gist` extension](https://www.postgresql.org/docs/current/btree-gist.html)
in the domain's database before applying the configuration. Install extensions
in a separate schema, since domain configuration manages functions in `public`.
Domain configuration does not install extensions automatically.

Use `unique: true` only with B-tree indexes. Combining `gin` and `gist`, or
combining either with `unique`, reports a configuration error.

Indexes are created if their names do not already exist. Changing an existing
index's column or method requires removing the old index or choosing a new name.
