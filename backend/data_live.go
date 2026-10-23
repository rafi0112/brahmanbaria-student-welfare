package main

// The in-memory data (directory, alumni, departments, upazilas, ...) is replaced as a whole when admins change it, so
// requests always see one consistent snapshot: readers take the current *Store, writers build a changed copy and swap it.

func (a *App) data() *Store {
	a.dataMu.RLock()
	defer a.dataMu.RUnlock()
	return a.Store
}

func (a *App) updateData(change func(s *Store)) {
	a.dataMu.Lock()
	defer a.dataMu.Unlock()
	next := *a.Store
	change(&next)
	a.Store = &next
}
