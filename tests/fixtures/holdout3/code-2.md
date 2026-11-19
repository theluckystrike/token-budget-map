```go
func (s *Store) Get0(ctx context.Context, id string) (*Item, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, name, updated_at FROM items_0 WHERE id = $1`, id)
	var it Item
	if err := row.Scan(&it.ID, &it.Name, &it.UpdatedAt); err != nil {
		return nil, fmt.Errorf("get0: %w", err)
	}
	return &it, nil
}

func (s *Store) Get1(ctx context.Context, id string) (*Item, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, name, updated_at FROM items_1 WHERE id = $1`, id)
	var it Item
	if err := row.Scan(&it.ID, &it.Name, &it.UpdatedAt); err != nil {
		return nil, fmt.Errorf("get1: %w", err)
	}
	return &it, nil
}

func (s *Store) Get2(ctx context.Context, id string) (*Item, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, name, updated_at FROM items_2 WHERE id = $1`, id)
	var it Item
	if err := row.Scan(&it.ID, &it.Name, &it.UpdatedAt); err != nil {
		return nil, fmt.Errorf("get2: %w", err)
	}
	return &it, nil
}

func (s *Store) Get3(ctx context.Context, id string) (*Item, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, name, updated_at FROM items_3 WHERE id = $1`, id)
	var it Item
	if err := row.Scan(&it.ID, &it.Name, &it.UpdatedAt); err != nil {
		return nil, fmt.Errorf("get3: %w", err)
	}
	return &it, nil
}

func (s *Store) Get4(ctx context.Context, id string) (*Item, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, name, updated_at FROM items_4 WHERE id = $1`, id)
	var it Item
	if err := row.Scan(&it.ID, &it.Name, &it.UpdatedAt); err != nil {
		return nil, fmt.Errorf("get4: %w", err)
	}
	return &it, nil
}

func (s *Store) Get5(ctx context.Context, id string) (*Item, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, name, updated_at FROM items_5 WHERE id = $1`, id)
	var it Item
	if err := row.Scan(&it.ID, &it.Name, &it.UpdatedAt); err != nil {
		return nil, fmt.Errorf("get5: %w", err)
	}
	return &it, nil
}

func (s *Store) Get6(ctx context.Context, id string) (*Item, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, name, updated_at FROM items_6 WHERE id = $1`, id)
	var it Item
	if err := row.Scan(&it.ID, &it.Name, &it.UpdatedAt); err != nil {
		return nil, fmt.Errorf("get6: %w", err)
	}
	return &it, nil
}
```
