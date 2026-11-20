package main

import "testing"

func TestLooseNameAndPersonIndex(t *testing.T) {
	for in, want := range map[string]string{
		"মোঃ মনিরুজ্জামান দিমন":  "মনিরুজ্জামান দিমন",
		"মো. মনিরুজ্জামান  দিমন": "মনিরুজ্জামান দিমন",
		"Md. Rafi Ahmed": "rafi ahmed",
		"অধ্যাপক ড. করিম": "করিম",
		"সুমন সরকার":      "সুমন সরকার",
	} {
		if got := looseName(in); got != want {
			t.Errorf("looseName(%q) = %q, want %q", in, got, want)
		}
	}
	ix := &personIndex{byName: map[string][]personRecord{}}
	ix.byName[looseName("মনিরুজ্জামান দিমন")] = []personRecord{{department: "Finance", batch: 14, session: "2018-19", upazila: "kasba"}, {department: "Finance", batch: 14, upazila: "kasba"}}
	ix.byName[looseName("রহিম")] = []personRecord{{department: "Finance", batch: 10}, {department: "Physics", batch: 12}}
	if r, ok := ix.find("মোঃ মনিরুজ্জামান দিমন"); !ok || r.session != "2018-19" || r.batch != 14 {
		t.Fatalf("one person in both lists: %+v %v", r, ok)
	}
	if _, ok := ix.find("রহিম"); ok {
		t.Fatal("two different people of the same name must give nothing")
	}
	if _, ok := ix.find("অচেনা"); ok {
		t.Fatal("unknown name")
	}
}
