// The home page's built-in slides. They are what the site shows until an admin changes the list, and the admin panel
// starts from them, so each one can be edited, reordered, hidden or deleted like any slide the admin adds. Captions name
// the place or subject only: people in the pictures are not presented as members of the association. `wm` is the faint
// chapter word set into the picture, `pos` frames the photograph and `boost` adds shade where it is bright behind the type.
export const BUILT_IN = [
  { id: 'dragon-boat', bn: 'নৌকাবাইচ · আমাদের ঐতিহ্য', en: 'Boat race · Our heritage', wm: 'বাইচ', pos: '46% 40%', boost: 0 },
  { id: 'jnu-main', bn: 'জগন্নাথ বিশ্ববিদ্যালয় · শিক্ষার্থী সমাজ', en: 'Jagannath University · Student community', wm: 'শিক্ষা', pos: '50% 35%', boost: 0.5 },
  { id: 'arifail-01', bn: 'আড়িফাইল মসজিদ, সরাইল · ইসলামি ঐতিহ্য', en: 'Arifail Mosque, Sarail · Islamic heritage', wm: 'স্থাপত্য', pos: '50% 30%', boost: 0.85 },
]

// the same slides as an admin's list: a bundled picture is named by its id, and shows from the site's own /images folder
export const builtInSlides = () => BUILT_IN.map((b) => ({ id: '', image: b.id, imageUrl: `/images/${b.id}-1280.webp`, captionBn: b.bn, captionEn: b.en, published: true }))
