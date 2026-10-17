package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type Student struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Batch      *int   `json:"batch"`
	Department string `json:"department"`
	Session    string `json:"session"`
	Upazila    string `json:"upazila"`
}

type Alumnus struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Batch       *int   `json:"batch"`
	Department  string `json:"department"`
	Occupation  string `json:"occupation"`
	Workplace   string `json:"workplace"`
	Designation string `json:"designation"`
	Upazila     string `json:"upazila"`
}

type Upazila struct {
	Slug         string   `json:"slug"`
	NameBn       string   `json:"nameBn"`
	NameEn       string   `json:"nameEn"`
	Unions       []string `json:"unions"`
	Population   *int     `json:"population"`
	AreaKm2      *float64 `json:"areaKm2"`
	Source       string   `json:"source"`
	LastVerified string   `json:"lastVerified"`
	Verified     bool     `json:"verified"`
	Note         string   `json:"note"`
	Members      int      `json:"members"`
	AlumniCount  int      `json:"alumni"`
	Places       int      `json:"places"`
}

type Fact struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

type Place struct {
	Slug         string   `json:"slug"`
	NameBn       string   `json:"nameBn"`
	NameEn       string   `json:"nameEn"`
	Category     string   `json:"category"`
	Upazila      string   `json:"upazila"`
	Lat          *float64 `json:"lat"`
	Lng          *float64 `json:"lng"`
	Images       []string `json:"images"`
	Summary      string   `json:"summary"`
	Details      string   `json:"details"`
	Facts        []Fact   `json:"facts"`
	Verified     bool     `json:"verified"`
	Sources      []string `json:"sources"`
	LastVerified string   `json:"lastVerified"`
}

type Post struct {
	Slug      string   `json:"slug"`
	Sample    bool     `json:"sample"`
	TitleBn   string   `json:"titleBn"`
	TitleEn   string   `json:"titleEn"`
	Category  string   `json:"category"`
	Date      string   `json:"date"`
	ReadMin   int      `json:"readMin"`
	Author    string   `json:"author"`
	Image     string   `json:"image"`
	ExcerptBn string   `json:"excerptBn"`
	ExcerptEn string   `json:"excerptEn"`
	BodyBn    []string `json:"bodyBn"`
	BodyEn    []string `json:"bodyEn"`
}

type Store struct {
	Students []Student
	Alumni   []Alumnus
	Upazilas []Upazila
	Places   []Place
	Posts    []Post
	Blood    map[string]int
	Sample   bool // true when synthetic student data is in use
}

func readJSON(path string, v any) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}

// loadStore reads content and member data. Real member files are git-ignored;
// when they are absent the synthetic *.sample.json files are used instead.
func loadStore(dir string) (*Store, error) {
	s := &Store{Blood: map[string]int{}}
	for name, dst := range map[string]any{"upazilas": &s.Upazilas, "heritage": &s.Places, "blog": &s.Posts} {
		if err := readJSON(filepath.Join(dir, "content", name+".json"), dst); err != nil {
			return nil, fmt.Errorf("content/%s: %w", name, err)
		}
	}
	if err := readJSON(filepath.Join(dir, "students.json"), &s.Students); err != nil {
		s.Sample = true
		if err := readJSON(filepath.Join(dir, "students.sample.json"), &s.Students); err != nil {
			return nil, fmt.Errorf("students: %w", err)
		}
	}
	if err := readJSON(filepath.Join(dir, "alumni.json"), &s.Alumni); err != nil {
		if err := readJSON(filepath.Join(dir, "alumni.sample.json"), &s.Alumni); err != nil {
			return nil, fmt.Errorf("alumni: %w", err)
		}
	}
	var st struct {
		Blood map[string]int `json:"blood"`
	}
	if readJSON(filepath.Join(dir, "stats.json"), &st) == nil && st.Blood != nil {
		s.Blood = st.Blood
	}
	sort.Slice(s.Posts, func(i, j int) bool { return s.Posts[i].Date > s.Posts[j].Date })
	for i := range s.Upazilas {
		u := &s.Upazilas[i]
		for _, st := range s.Students {
			if st.Upazila == u.Slug {
				u.Members++
			}
		}
		for _, a := range s.Alumni {
			if a.Upazila == u.Slug {
				u.AlumniCount++
			}
		}
		for _, p := range s.Places {
			if p.Upazila == u.Slug {
				u.Places++
			}
		}
	}
	return s, nil
}

func contains(hay, needle string) bool {
	return strings.Contains(strings.ToLower(hay), strings.ToLower(needle))
}
