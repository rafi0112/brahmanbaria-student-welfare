package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"unicode"
)

// Many directory records at once, from a spreadsheet (CSV) the admin uploads. The browser reads the file and sends its
// rows; every row is checked the same way as a record added by hand. With dryRun nothing is saved and the answer says,
// row by row, what would happen; otherwise the good rows are saved and the others are reported with their reasons.
// A row that matches a person already in the directory (same phone, or the same name, batch and department) is skipped.

const maxImportRows = 2000

type importRow struct {
	Name       string `json:"name"`
	Batch      string `json:"batch"`
	Department string `json:"department"`
	Session    string `json:"session"`
	Upazila    string `json:"upazila"`
	Union      string `json:"union"`
	Gender     string `json:"gender"`
	BloodGroup string `json:"bloodGroup"`
	Phone      string `json:"phone"`
	Note       string `json:"note"`
}

type importResult struct {
	Row    int               `json:"row"` // 1-based, in the order sent
	Status string            `json:"status"`
	Name   string            `json:"name"`
	ID     string            `json:"id,omitempty"`
	Errors map[string]string `json:"errors,omitempty"`
}

func (a *App) bulkImportRoutes(m *http.ServeMux, h func(func(http.ResponseWriter, *http.Request)) http.HandlerFunc) {
	adm := func(f func(http.ResponseWriter, *http.Request, User)) http.HandlerFunc { return h(a.requireAdmin(f)) }
	m.HandleFunc("POST /api/v1/admin/imported-students/import", adm(a.bulkImport))
}

// asciiDigits turns Bangla digits into 0-9 so "০১৭..." and "১৫" are read as numbers.
func asciiDigits(s string) string {
	return strings.Map(func(r rune) rune {
		if r >= '০' && r <= '৯' {
			return '0' + (r - '০')
		}
		return r
	}, s)
}

// normPhone keeps the digits of a phone number and drops a leading 88 / +88, so "+880 1712-345678" is 01712345678.
func normPhone(s string) string {
	d := strings.Map(func(r rune) rune {
		if unicode.IsDigit(r) {
			return r
		}
		return -1
	}, asciiDigits(s))
	if strings.HasPrefix(d, "88") && len(d) == 13 {
		d = d[2:]
	}
	return d
}

// rowToBody reads one spreadsheet row into the same shape as the "add a record" form: names of departments, upazilas,
// unions, genders and blood groups may be written loosely (any case, Bangla or English upazila names).
func (a *App) rowToBody(r importRow) manualBody {
	fold := func(s string) string { return strings.ToLower(strings.Join(strings.Fields(s), " ")) }
	b := manualBody{Name: strings.Join(strings.Fields(r.Name), " "), Session: strings.TrimSpace(asciiDigits(r.Session)), Note: strings.TrimSpace(r.Note)}
	b.Batch, _ = strconv.Atoi(strings.TrimSpace(asciiDigits(r.Batch)))
	b.Department = strings.TrimSpace(r.Department)
	for _, d := range a.data().Depts {
		if fold(d) == fold(r.Department) {
			b.Department = d
		}
	}
	up := fold(r.Upazila)
	for _, u := range a.data().Upazilas {
		names := []string{u.Slug, u.NameEn, u.NameBn, strings.TrimSuffix(u.NameEn, " Upazila"), strings.TrimSuffix(u.NameBn, " উপজেলা")}
		for _, n := range names {
			if up != "" && fold(n) == up {
				b.Upazila = u.Slug
			}
		}
		if b.Upazila == u.Slug {
			for _, x := range u.Unions {
				if fold(x) == fold(r.Union) {
					b.Union = x
				}
			}
		}
	}
	if b.Upazila == "" {
		b.Upazila = strings.TrimSpace(r.Upazila) // reported as not on the list
	}
	if b.Union == "" {
		b.Union = strings.TrimSpace(r.Union)
	}
	switch fold(r.Gender) {
	case "female", "f", "মহিলা", "নারী":
		b.Gender = "female"
	case "male", "m", "পুরুষ":
		b.Gender = "male"
	case "other", "অন্যান্য":
		b.Gender = "other"
	default:
		b.Gender = strings.TrimSpace(r.Gender)
	}
	b.BloodGroup = strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(r.BloodGroup), " ", ""))
	b.BloodGroup = strings.NewReplacer("VE", "", "POSITIVE", "+", "NEGATIVE", "-", "(", "", ")", "").Replace(b.BloodGroup)
	b.Phone = strings.TrimSpace(r.Phone)
	if b.Phone != "" {
		b.Phone = normPhone(b.Phone)
	}
	return b
}

func (a *App) bulkImport(w http.ResponseWriter, r *http.Request, u User) {
	var body struct {
		Rows   []importRow `json:"rows"`
		DryRun bool        `json:"dryRun"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4<<20) // a few thousand rows
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apiError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(body.Rows) == 0 {
		apiError(w, http.StatusBadRequest, "no rows")
		return
	}
	if len(body.Rows) > maxImportRows {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "too_many_rows", "max": maxImportRows})
		return
	}
	// who is already in the directory, so the same person is not added twice
	existing, _, err := a.importedAll(r.Context(), url.Values{"scope": {"all"}})
	if err != nil {
		log.Printf("bulk import: %v", err)
		apiError(w, 500, "could not read the directory")
		return
	}
	key := func(name string, batch int, dept string) string {
		return fmt.Sprintf("%s|%d|%s", strings.ToLower(strings.Join(strings.Fields(name), " ")), batch, strings.ToLower(dept))
	}
	phones, people := map[string]bool{}, map[string]bool{}
	for _, s := range existing {
		if p := normPhone(s.Phone); p != "" {
			phones[p] = true
		}
		if s.Batch != nil {
			people[key(s.Name, *s.Batch, s.Department)] = true
		}
	}
	results := make([]importResult, 0, len(body.Rows))
	counts := map[string]int{"added": 0, "ready": 0, "duplicate": 0, "invalid": 0}
	for i, row := range body.Rows {
		res := importResult{Row: i + 1, Name: strings.TrimSpace(row.Name)}
		b := a.rowToBody(row)
		in, errs := a.validateManual(b)
		switch {
		case len(errs) > 0:
			res.Status, res.Errors = "invalid", errs
		case (in.Phone != "" && phones[in.Phone]) || people[key(in.Name, *in.Batch, in.Department)]:
			res.Status = "duplicate"
		case body.DryRun:
			res.Status = "ready"
		default:
			rec, err := a.Auth.Store.CreateManualImported(r.Context(), u.ID, in)
			if err != nil {
				log.Printf("bulk import row %d: %v", i+1, err)
				res.Status, res.Errors = "invalid", map[string]string{"row": "Could not be saved. Try again."}
				break
			}
			res.Status, res.ID = "added", rec.ID
		}
		if res.Status == "ready" || res.Status == "added" { // later rows of the same file count as already there
			if in.Phone != "" {
				phones[in.Phone] = true
			}
			people[key(in.Name, *in.Batch, in.Department)] = true
		}
		counts[res.Status]++
		results = append(results, res)
	}
	if !body.DryRun && counts["added"] > 0 {
		_ = a.Auth.Store.Audit(r.Context(), u.ID, "imported.bulk_create", "imported", "", map[string]any{"added": counts["added"], "rows": len(body.Rows)})
	}
	writeJSON(w, 200, map[string]any{"dryRun": body.DryRun, "counts": counts, "rows": results})
}
