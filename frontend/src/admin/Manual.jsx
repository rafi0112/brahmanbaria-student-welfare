import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../lib/app.jsx'
import { PageHeader } from './kit.jsx'

// The admin panel's user manual in Bangla and English (switch at the top; it starts in the site's current language):
// what each page is for and how to do the everyday jobs, step by step. Each section links to the page it describes.

const Go = ({ to, children }) => <Link className="man-path" to={to}>{children} →</Link>

export default function AdminManual() {
  const app = useApp()
  const [lang, setLang] = useState(app.lang === 'en' ? 'en' : 'bn')
  const T = (bn, en) => (lang === 'en' ? en : bn)
  const open = T('খুলুন', 'Open')
  const { hash } = useLocation()
  useEffect(() => { // a help link opens the manual at its part
    if (!hash) return undefined
    const id = setTimeout(() => { const el = document.getElementById(hash.slice(1)); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('man-flash'); setTimeout(() => el.classList.remove('man-flash'), 1800) } }, 80)
    return () => clearTimeout(id)
  }, [hash])

  const SECTIONS = [
    ['start', T('শুরু করার আগে', 'Before you start')], ['dashboard', T('ড্যাশবোর্ড', 'Dashboard')],
    ['requests', T('সদস্যপদের আবেদন', 'Membership requests')], ['directory', T('সদস্য ডিরেক্টরি', 'Member directory')],
    ['alumni', T('অ্যালামনাই', 'Alumni')], ['photos', T('মানুষের ছবি যোগ করা', 'Adding people’s photos')],
    ['site-images', T('সাইটের ছবি ও হোম স্লাইড', 'Site pictures and home slides')], ['site-texts', T('ওয়েবসাইটের লেখা', 'Website texts')], ['gallery', T('গ্যালারি', 'Gallery')],
    ['events', T('ইভেন্ট', 'Events')], ['blog', T('ব্লগ ও ঐতিহ্য', 'Blog and heritage')], ['blog-submissions', T('সদস্যদের লেখা', 'Members’ writing')],
    ['committee', T('কার্যনির্বাহী কমিটি', 'Executive committee')], ['contact', T('যোগাযোগ বার্তা', 'Contact messages')],
    ['roles', T('অ্যাডমিন ও ভূমিকা', 'Admins and roles')], ['faq', T('প্রশ্নোত্তর ও রেফারেন্স তথ্য', 'FAQ and reference data')],
    ['editable', T('কী কী বদলানো যায়', 'What can be changed')], ['visitors', T('দর্শকদের জন্য সুবিধা', 'What visitors get')], ['rules', T('নিয়ম ও সতর্কতা', 'Rules and cautions')], ['handover', T('হস্তান্তর ও রক্ষণাবেক্ষণ', 'Handover and upkeep')],
  ]

  return (
    <div lang={lang}>
      <PageHeader title={T('ব্যবহার নির্দেশিকা', 'User manual')}
        desc={T('অ্যাডমিন প্যানেলের প্রতিটি পাতা কী কাজে লাগে এবং দৈনন্দিন কাজগুলো ধাপে ধাপে কীভাবে করবেন।', 'What each page of the admin panel is for, and how to do the everyday jobs step by step.')}
        action={(
          <span className="row">
            <span className="man-lang" role="group" aria-label="Language">
              <button type="button" aria-pressed={lang === 'bn'} onClick={() => setLang('bn')}>বাংলা</button>
              <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
            </span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => window.print()}>{T('প্রিন্ট / PDF', 'Print / PDF')}</button>
          </span>
        )} />
      <div className="man">
        <nav className="man-toc" aria-label={T('সূচিপত্র', 'Contents')}>
          {SECTIONS.map(([id, label]) => <a key={id} href={`#m-${id}`}>{label}</a>)}
        </nav>
        <div className="man-body">
          <section id="m-start">
            <h2>{T('শুরু করার আগে', 'Before you start')}</h2>
            <p>{T('অ্যাডমিন প্যানেলে ঢুকতে সাইটে নিজের অ্যাডমিন অ্যাকাউন্ট দিয়ে লগইন করুন, তারপর উপরের মেনু থেকে অ্যাডমিন খুলুন। বাঁ পাশের মেনু থেকে সব পাতায় যাওয়া যায়। সার্চ বক্স (Ctrl + K) দিয়ে যেকোনো পাতা দ্রুত খোলা যায়, আর তারকা চিহ্ন দিয়ে বেশি ব্যবহৃত পাতা পছন্দের তালিকায় রাখা যায়।',
              'Sign in to the site with your admin account, then open Admin from the top menu. The left menu leads to every page. The search box (Ctrl + K) opens any page quickly, and the star keeps your most used pages in your favourites.')}</p>
            <ul>
              <li>{T('প্রায় সব তালিকায় সার্চ, ফিল্টার ও পাতা বদলের ব্যবস্থা আছে।', 'Almost every list has search, filters and paging.')}</li>
              <li>{T('কোনো কিছু যোগ বা সম্পাদনা করলে একটি ফর্ম খোলে; Save / সংরক্ষণ না চাপা পর্যন্ত কিছু বদলায় না।', 'Adding or editing opens a form; nothing changes until you press Save.')}</li>
              <li>{T('প্রতিটি পাতার শিরোনামের পাশে “এই পাতার সাহায্য” লিংক আছে; চাপলে এই নির্দেশিকার সেই অংশটি খোলে। পুরো নির্দেশিকা বাঁ পাশের মেনুর একদম নিচে “ব্যবহার নির্দেশিকা”-তে।', 'Beside every page title there is a “Help for this page” link; it opens the part of this manual about that page. The whole manual is at the very bottom of the left menu, “User manual”.')}</li>
              <li>{T('আপনার প্রতিটি কাজ', 'Every action of yours is written, with name and time, on the')} <Go to="/admin/activity">{T('কার্যক্রম', 'Activity')}</Go> {T('পাতায় নাম ও সময়সহ লেখা থাকে।', 'page.')}</li>
            </ul>
          </section>

          <section id="m-dashboard">
            <h2>{T('ড্যাশবোর্ড', 'Dashboard')} <Go to="/admin">{open}</Go></h2>
            <p>{T('এক নজরে মোট সদস্য, অপেক্ষমাণ আবেদন, ব্যাচ ও উপজেলা অনুযায়ী শিক্ষার্থীর সংখ্যা এবং সাম্প্রতিক কাজ দেখা যায়। কোনো সংখ্যায় ক্লিক করলে সেই তালিকায় চলে যাবেন।',
              'See at a glance the total members, pending requests, students by batch and upazila, and recent actions. Click a number to go to that list.')}</p>
          </section>

          <section id="m-requests">
            <h2>{T('সদস্যপদের আবেদন', 'Membership requests')} <Go to="/admin/students?tab=requests">{open}</Go></h2>
            <p>{T('কেউ সাইটে নিবন্ধন করলে তাঁর আবেদন এখানে জমা হয়। অনুমোদন না দেওয়া পর্যন্ত তিনি শিক্ষার্থী বা অ্যালামনাই তালিকায় দেখা যান না।',
              'When someone registers, the request waits here. Until you approve it, the person is not shown in the students or alumni lists.')}</p>
            <ol>
              <li>{T('আবেদনকারীর নামে ক্লিক করে তথ্য (ব্যাচ, বিভাগ, উপজেলা, ফোন) মিলিয়ে দেখুন।', 'Click the name and check the details (batch, department, upazila, phone).')}</li>
              <li>{T('তথ্য ঠিক থাকলে অনুমোদন, ভুল বা অপরিচিত হলে বাতিল করুন।', 'Approve if the details are right; reject if they are wrong or the person is unknown.')}</li>
              <li>{T('একসাথে কয়েকজনকে বেছে নিয়ে উপরের বোতাম দিয়ে একবারে অনুমোদন করা যায়।', 'Select several people and approve them in one go with the button above the list.')}</li>
            </ol>
            <p className="man-note">{T('যাঁর ব্যাচ অ্যালামনাই হিসেবে গণ্য, নিবন্ধনের সময় তাঁকে পেশা ও বর্তমান কর্মস্থল লিখতেই হয়। অনুমোদনের পর তিনি অ্যালামনাই পাতায় দেখা যাবেন।',
              'A person whose batch counts as alumni must write their profession and current workplace when registering. After approval they appear on the Alumni page.')}</p>
          </section>

          <section id="m-directory">
            <h2>{T('সদস্য ডিরেক্টরি', 'Member directory')} <Go to="/admin/students?tab=members">{open}</Go></h2>
            <p>{T('এখানে দুই ধরনের মানুষ থাকেন: যাঁরা নিজে অ্যাকাউন্ট খুলেছেন (নিবন্ধিত সদস্য), আর যাঁদের তথ্য আগের গুগল ফর্ম থেকে এসেছে বা অ্যাডমিন হাতে যোগ করেছেন (ডিরেক্টরি রেকর্ড)। পাতার উপরের ট্যাব দিয়ে দুটির মধ্যে বদল করুন।',
              'Two kinds of people are here: those who opened an account themselves (registered members), and those whose details came from the earlier Google Form or were added by an admin (directory records). Switch between them with the tabs at the top.')}</p>
            <h3>{T('নতুন রেকর্ড যোগ করা', 'Adding a record')}</h3>
            <ol>
              <li>{T('যোগ করুন চাপুন, নাম, ব্যাচ ও বিভাগ দিন (এগুলো আবশ্যক), বাকি তথ্য জানা থাকলে দিন।', 'Press Add, enter name, batch and department (required), and the rest if you know it.')}</li>
              <li>{T('Save চাপুন। রেকর্ডটি শিক্ষার্থী পাতায় দেখা যাবে।', 'Press Save. The record shows on the Students page.')}</li>
            </ol>
            <h3>{T('যাচাই ও আমন্ত্রণ', 'Verifying and inviting')}</h3>
            <ul>
              <li>{T('যাচাই করুন: তথ্য মিলিয়ে দেখে রেকর্ডটিকে যাচাইকৃত চিহ্ন দিন।', 'Verify: check the details and mark the record verified.')}</li>
              <li>{T('ইমেইল যোগ করে আমন্ত্রণ পাঠান: মানুষটি ইমেইলে একটি লিংক পাবেন, যা দিয়ে নিজের পাসওয়ার্ড ঠিক করে অ্যাকাউন্ট চালু করতে পারবেন।', 'Add an email and send an invitation: the person gets a link to set their own password and activate the account.')}</li>
              <li>{T('Export: তালিকাটি এক্সেল/CSV ফাইল হিসেবে নামিয়ে নিন।', 'Export: download the list as an Excel/CSV file.')}</li>
            </ul>
            <h3>{T('একসাথে অনেক রেকর্ড যোগ করা (CSV ফাইল)', 'Adding many records at once (CSV file)')}</h3>
            <ol>
              <li>{T('“ডিরেক্টরি রেকর্ড” ট্যাবে “ফাইল থেকে একসাথে যোগ” চাপুন, তারপর “নমুনা ফাইল (CSV)” নামিয়ে নিন।', 'On the “Directory records” tab press “Import from a file”, then download the “Template (CSV)”.')}</li>
              <li>{T('নমুনা ফাইলটি Excel বা Google Sheets-এ খুলে প্রতি সারিতে একজনের তথ্য লিখুন। নাম, ব্যাচ ও বিভাগ আবশ্যক; বিভাগের নাম সাইটের তালিকার মতো হতে হবে। কলামের নাম বাংলা বা ইংরেজি হতে পারে (নাম/name, ব্যাচ/batch, ফোন/phone …)।', 'Open the template in Excel or Google Sheets and write one person per row. Name, batch and department are required; the department must be named as in the site’s list. Column names may be Bangla or English (নাম/name, ব্যাচ/batch, ফোন/phone …).')}</li>
              <li>{T('ফাইলটি “CSV UTF-8” হিসেবে সংরক্ষণ করুন (Excel: File › Save As)। Excel-এর .xlsx ফাইল সরাসরি চলবে না।', 'Save the file as “CSV UTF-8” (Excel: File › Save As). An Excel .xlsx file does not work directly.')}</li>
              <li>{T('“CSV ফাইল বাছুন” দিয়ে ফাইলটি দিন। আগে যাচাই হয়, কিছু সংরক্ষণ হয় না: কতজন প্রস্তুত, কতজন আগে থেকেই আছেন, আর কোন সারিতে কী ভুল, সব দেখাবে।', 'Choose the file with “Choose a CSV file”. It is checked first and nothing is saved: you see how many are ready, how many are already in the directory, and what is wrong in which row.')}</li>
              <li>{T('“… জন যোগ করুন” চাপলে শুধু প্রস্তুত সারিগুলো যোগ হয়। ভুল সারিগুলো ফাইলে ঠিক করে আবার একই ফাইল দিন; আগে যোগ হওয়া মানুষ আবার যোগ হবেন না।', 'Press “Add …” and only the ready rows are added. Fix the wrong rows in the file and give the same file again; people already added are not added twice.')}</li>
            </ol>
            <p className="man-note">{T('একই ফোন নম্বর, অথবা একই নাম-ব্যাচ-বিভাগের কেউ আগে থেকে থাকলে সেই সারি বাদ যায়। একবারে সর্বোচ্চ ২০০০ সারি।', 'A row is skipped when someone with the same phone, or the same name, batch and department, is already there. At most 2000 rows at a time.')}</p>
          </section>

          <section id="m-alumni">
            <h2>{T('অ্যালামনাই', 'Alumni')} <Go to="/admin/alumni">{open}</Go></h2>
            <h3>{T('কোন ব্যাচ পর্যন্ত অ্যালামনাই', 'Which batches count as alumni')}</h3>
            <p>{T('পাতার উপরে “ব্যাচ … পর্যন্ত অ্যালামনাই” সেটিং আছে। যেমন ১৫ দিলে ১৫ ও তার আগের সব ব্যাচ শিক্ষার্থী পাতা থেকে সরে অ্যালামনাই পাতায় দেখাবে। প্রতি বছর একটি ব্যাচ পাস করলে সংখ্যাটি এক বাড়িয়ে দিন।',
              'At the top of the page is the setting “alumni up to batch …”. For example, with 15, batch 15 and all earlier batches move from the Students page to the Alumni page. Raise the number by one each year when a batch graduates.')}</p>
            <h3>{T('অ্যালামনাই যোগ বা সম্পাদনা', 'Adding or editing an alumnus')}</h3>
            <ol>
              <li>{T('যোগ করুন চাপুন অথবা কোনো নামের পাশের মেনু থেকে সম্পাদনা খুলুন।', 'Press Add, or open Edit from the menu beside a name.')}</li>
              <li>{T('নাম, ব্যাচ, বিভাগ, পেশা/পদবি ও কর্মস্থল লিখুন।', 'Write name, batch, department, profession/designation and workplace.')}</li>
              <li>{T('ফোন, ইমেইল, রক্তের গ্রুপ ও ফেসবুক লিংক “ব্যক্তিগত তথ্য” অংশে দিন। এগুলো শুধু লগইন করা সদস্যরা দেখতে পান।', 'Put phone, email, blood group and Facebook link in the “Private details” part. Only signed-in members can see them.')}</li>
              <li>{T('Save চাপুন।', 'Press Save.')}</li>
            </ol>
            <p>{T('অ্যালামনাই ও শিক্ষার্থী পাতায় সবাইকে ব্যাচ অনুযায়ী দেখানো হয়, সিনিয়র ব্যাচ আগে। প্রতিটি ব্যাচের পাশে তার সেশন (বছর) লেখা থাকে।',
              'The Alumni and Students pages list everyone batch by batch, the senior batch first. Each batch shows its session (year) beside it.')}</p>
          </section>

          <section id="m-photos">
            <h2>{T('মানুষের ছবি যোগ করা', 'Adding people’s photos')}</h2>
            <p>{T('শিক্ষার্থী বা অ্যালামনাইয়ের ছবি দুইভাবে দেওয়া যায়, সম্পাদনার ফর্মের ছবি অংশে:', 'A photo of a student or alumnus can be given in two ways, in the Photo part of the edit form:')}</p>
            <ol>
              <li>{T('ডিভাইস থেকে আপলোড: বোতামটি চেপে কম্পিউটার বা ফোন থেকে JPG/PNG/WebP ছবি বেছে নিন (মূল ছবি ১৫ MB পর্যন্ত)। ছবি আপনার ব্রাউজারেই ছোট করে একবার সংরক্ষণ হয়; সাইটে আগে থেকে থাকা ছবি আবার আপলোড হয় না।', 'Upload from the device: press the button and choose a JPG/PNG/WebP picture from your computer or phone (the original may be up to 15 MB). The picture is optimized in your browser and stored once; a picture the site already has is not uploaded again.')}</li>
              <li>{T('ছবির লিংক: গুগল ড্রাইভের লিংক দিলে ছবিটি অবশ্যই “Anyone with the link” হিসেবে শেয়ার করা থাকতে হবে।', 'Photo link: for a Google Drive link the file must be shared as “Anyone with the link”.')}</li>
            </ol>
            <p>{T('ডিভাইস থেকে যেকোনো ছবি (সদস্যের ছবি, কমিটি, গ্যালারি, ইভেন্ট, সাইটের ছবি) বাছলে আপলোডের আগে “ছবি দেখুন ও ঠিক করুন” জানালা খোলে: আকার (মূল, বর্গ ১:১, ৪:৩, ৩:২, ১৬:৯, লম্বা ৩:৪) বেছে ক্রপ করুন, ছবি টেনে ফ্রেমে সাজান, জুম করুন, বাঁয়ে/ডানে ঘোরান বা উল্টো করুন, আর “আলো ও রং” থেকে উজ্জ্বলতা, কনট্রাস্ট ও রং ঠিক করুন। “এই ছবিটি ব্যবহার করুন” চাপলে ফ্রেমের ভেতরের অংশটুকুই আপলোড হয়; “যেমন আছে তেমনই দিন” চাপলে মূল ছবিই যায়। মানুষের ছবিতে শুরুতে বর্গ আকার বাছা থাকে। গ্যালারিতে একসাথে অনেক ছবি বাছলে প্রতিটির পাশে “দেখুন ও ঠিক করুন” বোতাম থাকে।',
              'Whenever a picture is chosen from the device (a person’s photo, committee, gallery, events, site pictures) a “Preview and adjust the picture” window opens before the upload: pick a shape (original, square 1:1, 4:3, 3:2, 16:9, portrait 3:4) to crop, drag the picture into place, zoom, turn it left/right or mirror it, and under “Light and colour” set brightness, contrast and colour. “Use this picture” uploads exactly what is inside the frame; “Use as it is” sends the original. For people’s photos the square shape is chosen to start with. When choosing many gallery pictures at once, each has a “Preview & adjust” button.')}</p>
            <p className="man-note">{T('পুরোনো গুগল ফর্মের অনেক ছবির লিংক ব্যক্তিগত (শেয়ার করা নয়), তাই সেগুলো সাইটে দেখায় না এবং এটি পাশ কাটানোর কোনো উপায় নেই। সমাধান: ছবিটি সংগ্রহ করে এখানে আপলোড করুন, অথবা মালিককে ড্রাইভে শেয়ার চালু করতে বলুন।',
              'Many photo links from the old Google Form are private (not shared), so they do not show on the site, and there is no way around that. Fix: collect the picture and upload it here, or ask the owner to turn on sharing in Drive.')}</p>
            <p>{T('ছবি সরান চাপলে ছবি মুছে নামের আদ্যক্ষর দেখাবে। সদস্য নিজেও নিজের প্রোফাইল থেকে ছবি বদলাতে বা সরাতে পারেন।', 'Remove photo clears it and shows the name’s initials. Members can also change or remove their own photo from their profile.')}</p>
          </section>

          <section id="m-site-images">
            <h2>{T('সাইটের ছবি ও হোম স্লাইড', 'Site pictures and home slides')} <Go to="/admin/site-images">{open}</Go></h2>
            <h3>{T('হোম পেজের স্লাইড', 'Home page slides')}</h3>
            <ol>
              <li>{T('নতুন স্লাইড যোগ করুন অংশে ছবি আপলোড করুন, লিংক দিন, অথবা গ্যালারি থেকে বাছুন চাপুন।', 'In “Add a slide”, upload a picture, paste a link, or press “Choose from the gallery”.')}</li>
              <li>{T('চাইলে বাংলা ও ইংরেজি ক্যাপশন লিখুন।', 'Write a Bangla and an English caption if you like.')}</li>
              <li>{T('প্রতিটি স্লাইডের “নম্বর” ঘর থেকে বেছে নিন সেটি কত নম্বরে দেখাবে (১ সবার আগে)। তীর চিহ্ন (↑ ↓) দিয়েও ক্রম বদলানো যায়।', 'Pick from each slide’s “Number” box at which number it shows (1 shows first). The arrows (↑ ↓) also change the order.')}</li>
              <li>{T('পাবলিশ / আনপাবলিশ দিয়ে কোনো স্লাইড দেখানো বা লুকানো যায়; ডাস্টবিন চিহ্ন দিয়ে মুছে ফেলা যায়।', 'Publish / Unpublish shows or hides a slide; the bin icon deletes it.')}</li>
              <li>{T('ছবি বাছা, আপলোড, পাবলিশ/আনপাবলিশ, ক্রম বদল ও মোছা সাথে সাথে সংরক্ষণ হয় এবং সাইটে দেখা যায়, আলাদা করে Save চাপতে হয় না। ক্যাপশন লিখে ঘরের বাইরে ক্লিক করলে সংরক্ষণ হয়।', 'Choosing, uploading, publishing/unpublishing, reordering and deleting are saved at once and show on the site; there is no separate Save step. A caption is saved when you click out of its field.')}</li>
            </ol>
            <p>{T('কোনো স্লাইড প্রকাশিত না থাকলে সাইট নিজের তিনটি ডিফল্ট ছবি দেখায়। এই তিনটি ছবি স্লাইডের তালিকাতেই আছে; এগুলোর ক্যাপশন বদলানো, ক্রম বদলানো, লুকানো বা মুছে ফেলা যায়, নতুন ছবিও যোগ করা যায়। সব স্লাইড মুছলে তিনটি ডিফল্ট ছবি ফিরে আসে। চওড়া (ল্যান্ডস্কেপ) ও পরিষ্কার ছবি ব্যবহার করুন, অন্তত ১৬০০ পিক্সেল চওড়া।',
              'If no slide is published, the site shows its three built-in pictures. Those three are in the slide list itself: edit their captions, reorder, hide or delete them, and add new pictures. Delete every slide and the three built-in pictures come back. Use wide (landscape), clear pictures, at least 1600 pixels wide.')}</p>
            <h3>{T('ভিডিও স্লাইড', 'Video slides')}</h3>
            <p>{T('“অথবা একটি ভিডিও” অংশ থেকে একটি ভিডিও ফাইল (MP4 বা WebM, সর্বোচ্চ ৫০ MB) আপলোড করুন, অথবা YouTube ভিডিওর লিংক দিন। ভিডিও স্লাইড ছবির স্লাইডের মতোই পুরো ফ্রেম জুড়ে শব্দ ছাড়া চলে। আপলোড করা ভিডিও শেষ পর্যন্ত (সর্বোচ্চ ১ মিনিট), আর YouTube ভিডিও ২০ সেকেন্ড চলে, তারপর পরের স্লাইড আসে। ক্যাপশন, ক্রম, পাবলিশ ও মোছা ছবির স্লাইডের মতোই।',
              'Under “Or a video”, upload a video file (MP4 or WebM, up to 50 MB) or paste a YouTube link. A video slide fills the same frame as a picture and plays without sound. An uploaded video plays to its end (at most a minute) and a YouTube video for 20 seconds, then the next slide comes. Captions, order, publishing and deleting work as for picture slides.')}</p>
            <p className="man-note">{T('iPhone-এর .mov ভিডিও সব ব্রাউজারে চলে না; MP4 হিসেবে সেভ করে দিন। বড় ভিডিও YouTube-এ রেখে লিংক দেওয়াই ভালো: সাইট দ্রুত খোলে এবং জায়গাও লাগে না।', 'iPhone .mov videos do not play in every browser; save them as MP4. For a long video, put it on YouTube and paste the link: the site opens faster and no storage is used.')}</p>
            <h3>{T('প্রতিটি পাতার উপরের ছবি', 'The picture at the top of each page')}</h3>
            <p>{T('শিক্ষার্থী, অ্যালামনাই, কমিটি, ইভেন্ট, গ্যালারি, ঐতিহ্য, ব্লগ ইত্যাদি পাতার শুরুতে যে ছবি থাকে তা এখান থেকে বদলানো যায়। যে পাতার ছবি বদলাতে চান শুধু সেটিতে ছবি দিন; খালি রাখলে ডিফল্ট ছবি থাকবে।',
              'The picture at the start of the Students, Alumni, Committee, Events, Gallery, Heritage, Blog and other pages can be changed here. Set a picture only for the pages you want to change; empty means the built-in picture stays.')}</p>
            <h3>{T('পাতার ভেতরের ছবি', 'Pictures inside the pages')}</h3>
            <p>{T('“আমাদের সম্পর্কে” পাতার লেখার পাশের দুটি ছবি, এবং হোম পেজের “যারা গড়ছে আগামী” অংশের ছবি “পাতার ভেতরের ছবি” অংশ থেকে বদলান। খালি রাখলে সাইটের নিজের ছবি থাকে।',
              'The two pictures beside the text of the About page, and the “The people shaping tomorrow” picture are changed under “Pictures inside the pages”. Empty means the site’s own picture stays.')}</p>
            <p>{T('একই অংশে আছে: শিক্ষার্থীর প্রোফাইল পাতার উপরের ছবি, এবং ঐতিহ্য পাতার তিনটি “ঘুরে দেখুন” কার্ড ও চারটি সংস্কৃতির ছবি।', 'The same part also holds the picture at the top of a student’s profile page, and the Heritage page’s three “Explore” cards and four culture pictures.')}</p>
            <h3>{T('লোগো ও স্কেচ', 'Logo and sketches')}</h3>
            <p>{T('উপরের মেনু, ফুটার ও লগইন পাতার লোগো, আর হোম ও ফুটারের পেনসিল-স্কেচগুলো “লোগো ও স্কেচ” অংশ থেকে বদলায়। লোগোর জন্য বর্গাকার, স্বচ্ছ পটভূমির PNG ভালো। ব্রাউজার ট্যাবের ছোট আইকন ও ইমেইলের লোগো এখান থেকে বদলায় না (ডেভেলপার বদলাতে পারেন)।',
              'The logo of the top menu, footer and sign-in pages, and the pencil sketches on Home and in the footer, are changed under “Logo and sketches”. For the logo a square PNG with a transparent background works best. The small browser-tab icon and the logo in emails do not change from here (the developer can change them).')}</p>
            <h3>{T('গ্যালারির ফিচার্ড ছবি ও “ঘুরে দেখুন ব্রাহ্মণবাড়িয়া”', 'Gallery featured picture and “Explore Brahmanbaria”')}</h3>
            <p>{T('গ্যালারি পাতার শুরুতে বড় করে দেখানোর জন্য একটি ফিচার্ড ছবি বেছে নিতে পারেন। হোম পেজের “ঘুরে দেখুন ব্রাহ্মণবাড়িয়া” অংশের ছবিও এখান থেকে বদলায়।',
              'Choose a featured picture to show large at the start of the Gallery page. The “Explore Brahmanbaria” picture on the home page is changed here too.')}</p>
          </section>

          <section id="m-site-texts">
            <h2>{T('ওয়েবসাইটের লেখা', 'Website texts')} <Go to="/admin/site-texts">{open}</Go></h2>
            <p>{T('সাইটের প্রায় সব লেখা (শিরোনাম, বর্ণনা, বোতাম, মেনু, ফুটার, বার্তা) কোড ছাড়াই বাংলা ও ইংরেজিতে বদলানো যায়।', 'Almost every text of the site (headings, descriptions, buttons, menu, footer, messages) can be changed in Bangla and English without code.')}</p>
            <ol>
              <li>{T('উপরের বোতাম থেকে সাইটের অংশ বাছুন (যেমন “হোম পেজ”, “আমাদের সম্পর্কে”), অথবা খোঁজার ঘরে লেখাটির কয়েকটি শব্দ লিখুন।', 'Pick a part of the site from the buttons (such as “Home page”, “About”), or type a few words of the text into the search box.')}</li>
              <li>{T('প্রতিটি কার্ডের উপরে লেখা থাকে লেখাটি কী (শিরোনাম, বোতাম, বার্তা…) এবং সাইটের কোথায় দেখায়। “পাতাটি দেখুন” চাপলে সেই পাতা খোলে।', 'Each card says what the text is (a heading, a button, a message…) and where on the site it appears. “See the page” opens that page.')}</li>
              <li>{T('ঘরে এখনকার লেখাই থাকে; সেখানেই বাংলা ও ইংরেজি লেখা বদলান।', 'The boxes hold the current wording; change the Bangla and English right there.')}</li>
              <li>{T('“আমাদের সম্পর্কে” পাতার “এক নজরে” অংশের চারটি সংখ্যা (শিক্ষার্থী, ব্যাচ, উপজেলা, ঐতিহাসিক স্থান) সাইট নিজে গোনে; শিক্ষার্থী = বর্তমান শিক্ষার্থী + অ্যালামনাই। নিজের সংখ্যা দেখাতে চাইলে “আমাদের সম্পর্কে” অংশে “এক নজরে: … সংখ্যা” ঘরে লিখুন (যেমন ১৩০); ঘর খালি করলে আবার নিজে গোনা হয়। নামগুলোও (“এক নজরে: … নাম”) বদলানো যায়। পাতার জেলা ও বিশ্ববিদ্যালয়ের তথ্যও এখান থেকে বদলানো যায় — প্রকাশের আগে একবার মিলিয়ে নিন।', 'The four numbers in “At a glance” on the About page (students, batches, upazilas, heritage places) are counted by the site; students = current students + alumni. To show your own, type it into “At a glance: number of …” under About (for example 130); emptying the box makes the site count again. Their names (“At a glance: name of …”) can be changed too. The district and university facts on that page are edited here as well — check them once.')}</li>
              <li>{T('নিচের “সংরক্ষণ করুন” চাপুন। সাইটে সাথে সাথে নতুন লেখা দেখা যাবে।', 'Press “Save” at the bottom. The site shows the new wording at once.')}</li>
            </ol>
            <ul>
              <li>{T('ভুল হলে কার্ডের “আগের লেখায় ফেরান” চেপে সংরক্ষণ করুন, আসল লেখা ফিরে আসবে। “শুধু বদলানো লেখা” টিক দিলে যা যা বদলেছেন শুধু সেগুলো দেখায়।', 'If you make a mistake, press “Use the original” on the card and save: the original wording comes back. Tick “Only changed texts” to see just what you changed.')}</li>
              <li>{T('কিছু লেখায় {n} বা {name}-এর মতো চিহ্ন থাকে; সেখানে সাইট নিজে সংখ্যা বা নাম বসায়। এগুলো মুছবেন না।', 'Some texts contain marks such as {n} or {name}; the site puts a number or a name there. Do not remove them.')}</li>
              <li>{T('ইভেন্ট, ব্লগ, গ্যালারির ক্যাপশন, কমিটির সদস্য, প্রশ্নোত্তর ও ঐতিহ্যের লেখা এখানে নয়, তাদের নিজের পাতা থেকে বদলান।', 'Events, blog articles, gallery captions, committee members, FAQ and heritage texts are not here; change them on their own pages.')}</li>
            </ul>
          </section>

          <section id="m-gallery">
            <h2>{T('গ্যালারি', 'Gallery')} <Go to="/admin/gallery">{open}</Go></h2>
            <ol>
              <li>{T('“ছবি আপলোড” চেপে একসাথে অনেক ছবি বেছে নিন (আরও ছবি পরে যোগ করা যায়, অপছন্দের ছবি ✕ দিয়ে বাদ দেওয়া যায়)। প্রতিটি ছবির প্রিভিউ, মূল ও ছোট করা আকার এবং অগ্রগতি দেখা যায়; একই ছবি দুবার বাছলে একবারই সংরক্ষণ হয়। সবশেষে আপলোড চাপুন, প্রতিটি ছবি গ্যালারিতে আলাদা এন্ট্রি হয়ে যাবে।', 'Press “Upload pictures” and choose many at once (you can add more later and take a picture out with ✕). Each picture shows a preview, its original and optimized size and its progress; the same picture chosen twice is stored once. Then press Upload: every picture becomes its own gallery entry.')}</li>
              <li>{T('ক্যাপশন (বাংলা ও ইংরেজি), ছবির বর্ণনা (alt), কৃতজ্ঞতা/উৎস এবং চাইলে অ্যালবাম বেছে দিন।', 'Give captions (Bangla and English), a description (alt), credit/source and, if you want, an album.')}</li>
              <li>{T('প্রকাশ করলে ছবিটি গ্যালারি পাতায় দেখা যাবে; লুকান করলে সরে যাবে কিন্তু মুছবে না।', 'Publishing shows the picture on the Gallery page; hiding removes it from view without deleting it.')}</li>
              <li>{T('অ্যালবাম তৈরি করে ছবিগুলো অনুষ্ঠান অনুযায়ী ভাগ করা যায়।', 'Create albums to group pictures by occasion.')}</li>
              <li>{T('গ্যালারির ছবি সাইটের যেকোনো জায়গায় আবার ব্যবহার করা যায়: যেখানেই ছবি দেওয়ার ঘর আছে (ব্লগের প্রচ্ছদ, ইভেন্ট, ঐতিহাসিক স্থান, পাতার ছবি, হোম স্লাইড, কমিটি সদস্য, শিক্ষার্থী ও অ্যালামনাইয়ের ছবি) সেখানে “গ্যালারি থেকে বাছুন” আছে। খুঁজে একটি ছবিতে চাপুন — আর কিছু আপলোড করতে হয় না।', 'Gallery pictures can be reused anywhere on the site: wherever there is a picture box (blog cover, events, historic places, page pictures, home slides, committee members, student and alumni photos) there is “Choose from the gallery”. Search, press a picture — nothing needs uploading again.')}</li>
              <li>{T('অনেক ছবি একসাথে: ইভেন্ট ও ঐতিহাসিক স্থানে “গ্যালারি থেকে অনেক ছবি বাছুন”, হোম স্লাইডে “গ্যালারি থেকে এক বা একাধিক ছবি বাছুন”, আর ব্লগ লেখার বক্সে “গ্যালারি থেকে ছবি” বোতাম। ছবিগুলোতে চাপলে নম্বর পড়ে (যে ক্রমে চাপবেন সেই ক্রমে যোগ হবে), তারপর “…টি ছবি যোগ করুন” চাপুন।', 'Many at once: “Choose many from the gallery” for events and historic places, “Choose one or more from the gallery” for home slides, and the “Pictures from the gallery” button in the blog writing box. Pressing pictures numbers them (they are added in that order); then press “Add … pictures”.')}</li>
              <li>{T('ক্রম বদলাতে একটি ছবি মাউস দিয়ে টেনে অন্য ছবির জায়গায় ছেড়ে দিন (ফোনে ↑ ↓ বোতাম ব্যবহার করুন)। নতুন ক্রম সাথে সাথে সংরক্ষণ হয়। এটি “ক্রম অনুযায়ী” সাজানো থাকলে এবং কোনো খোঁজ/ফিল্টার না থাকলে কাজ করে।', 'To change the order, drag a picture with the mouse and drop it on the place of another (on a phone use the ↑ ↓ buttons). The new order is saved at once. This works while the list is sorted “by order” with no search or filter.')}</li>
            </ol>
            <h3>{T('গ্যালারিতে ভিডিও', 'Videos in the gallery')}</h3>
            <ol>
              <li>{T('“+ ভিডিও যোগ করুন” চাপুন।', 'Press “+ Add a video”.')}</li>
              <li>{T('ভিডিও ফাইল আপলোড করুন (MP4 বা WebM, সর্বোচ্চ ৫০ MB), অথবা YouTube লিংক দিয়ে “YouTube ভিডিও যোগ করুন” চাপুন।', 'Upload a video file (MP4 or WebM, up to 50 MB), or paste a YouTube link and press “Add the YouTube video”.')}</li>
              <li>{T('ক্যাপশন, অ্যালবাম ও তারিখ দিয়ে “গ্যালারিতে যোগ করুন” চাপুন। ছবির মতোই ভিডিওটি প্রথমে লুকানো থাকে; “সাইটে দেখান” চাপলে গ্যালারিতে দেখা যায়।', 'Give a caption, album and date and press “Add to the gallery”. Like a picture, the video starts hidden; press “Show on site” to put it in the gallery.')}</li>
            </ol>
            <p>{T('গ্যালারিতে ভিডিওর ছবির উপর ▶ চিহ্ন থাকে; দর্শক ক্লিক করলে বড় করে শব্দসহ চলে। চাইলে সম্পাদনা থেকে একটি কভার ছবিও দিতে পারেন।', 'In the gallery a video shows a ▶ mark; a visitor clicks it to watch it large, with sound. You can also give it a cover picture from its edit form.')}</p>
            <h3>{T('বছর অনুযায়ী সাজানো', 'Grouped by year')}</h3>
            <p>{T('সাইটের গ্যালারি পাতায় ছবিগুলো বছর অনুযায়ী ভাগ হয়ে দেখায়, আর দর্শক বছর বেছে দেখতে পারেন। ছবির বছর আসে তার “তারিখ” থেকে; তারিখ না থাকলে যে বছর প্রকাশ হয়েছে সেটি ধরা হয়।', 'On the site’s Gallery page pictures appear grouped by year, and visitors can pick a year. A picture’s year comes from its “date”; without a date, the year it was published is used.')}</p>
            <ul>
              <li>{T('আপলোডের সময়: “এই ছবিগুলোর তারিখ” ঘরে তারিখ দিলে একসাথে আপলোড করা সব ছবি সেই বছরে যায়।', 'While uploading: give a date in “Date of these pictures” and every picture of that upload goes under its year.')}</li>
              <li>{T('পরে: ছবিগুলো টিক দিয়ে বাছুন, নিচের তারিখের ঘরে তারিখ দিয়ে “তারিখ দিন” চাপুন। একটি ছবির তারিখ তার সম্পাদনা ফর্ম থেকেও বদলানো যায়।', 'Later: tick the pictures, give a date in the date box of the bar that appears and press “Set the date”. One picture’s date can also be changed in its edit form.')}</li>
            </ul>
            <p className="man-note">{T('অন্যের তোলা ছবি দিলে অনুমতি আছে কিনা নিশ্চিত হোন এবং কৃতজ্ঞতার ঘরে নাম লিখুন।', 'If a picture was taken by someone else, make sure you have permission and write their name in the credit field.')}</p>
          </section>

          <section id="m-events">
            <h2>{T('ইভেন্ট', 'Events')} <Go to="/admin/events">{open}</Go></h2>
            <ol>
              <li>{T('যোগ করুন চেপে শিরোনাম, তারিখ, সময়, স্থান ও বিবরণ লিখুন।', 'Press Add and write title, date, time, place and description.')}</li>
              <li>{T('একটি প্রধান ছবি দিন; অনুষ্ঠানের পর আরও ছবি (সর্বোচ্চ ২৪টি) যোগ করা যায়। “একসাথে অনেক ছবি যোগ করুন” চাপলে একবারে অনেক ছবি বেছে আপলোড করা যায়; তারপর সংরক্ষণ করুন।', 'Give one main picture; after the event more pictures (up to 24) can be added. “Add many photos at once” lets you choose and upload many in one go; then save.')}</li>
              <li>{T('প্রকাশ করলে ইভেন্টটি হোম পেজ ও ইভেন্ট পাতায় তারিখ অনুযায়ী দেখাবে।', 'Once published, the event shows on the home page and the Events page by date.')}</li>
            </ol>
            <p>{T('দর্শকেরা ইভেন্টের পাতা থেকে “শেয়ার করুন” চেপে ফেসবুক/মেসেঞ্জারে লিংক পাঠাতে পারেন, আর “ক্যালেন্ডারে যোগ করুন” চেপে নিজের ফোনের ক্যালেন্ডারে তারিখ-সময় রাখতে পারেন। তাই সময় ও স্থান ঠিকমতো লিখুন।', 'Visitors can press “Share” on an event page to send its link (Facebook, Messenger…) and “Add to calendar” to keep its date and time in their phone’s calendar. So write the time and place carefully.')}</p>
          </section>

          <section id="m-blog">
            <h2>{T('ব্লগ ও ঐতিহ্য', 'Blog and heritage')} <Go to="/admin/blog">{T('ব্লগ', 'Blog')}</Go> <Go to="/admin/heritage">{T('ঐতিহ্য', 'Heritage')}</Go></h2>
            <p>{T('ব্লগে সংবাদ, ঘোষণা ও লেখা প্রকাশ করা যায়; ঐতিহ্য অংশে জেলার ঐতিহাসিক ও দর্শনীয় স্থানের তথ্য থাকে।', 'The blog carries news, announcements and articles; the heritage section holds the district’s historical and scenic places.')}</p>
            <ul>
              <li>{T('নতুন লেখা প্রথমে খসড়া হিসেবে থাকে; প্রস্তুত হলে প্রকাশ করুন। প্রকাশিত লেখা সাথে সাথে পাবলিক ব্লগ পাতায় দেখায়।', 'A new article starts as a draft; publish it when it is ready. A published article shows on the public Blog page at once.')}</li>
              <li>{T('“★ বিশেষ” (Featured) করা লেখাটি ব্লগ পাতার একদম উপরে বড় করে দেখায়; না থাকলে সবচেয়ে নতুন লেখাটি। বাকিগুলো নিচে কার্ডে। প্রতিটি লেখায় একটি ভালো প্রচ্ছদ ছবি ও ছোট সারাংশ দিন, কার্ডে সেগুলোই দেখায়।', 'The “★ Featured” article shows large at the top of the Blog page; otherwise the newest one does. The rest show as cards below. Give every article a good cover picture and a short summary; the cards show those.')}</li>
              <li>{T('সাইটের সাথে আসা নমুনা লেখার পাশে “নমুনা লেখা — সাইটে লুকানো” ট্যাগ থাকে; এগুলো প্রকাশিত দেখালেও পাবলিক পাতায় দেখায় না। নিজের লেখা দিয়ে বদলে সংরক্ষণ করুন, অথবা “সাইটে দেখান” চাপুন। দরকার না হলে আর্কাইভ করুন।', 'Sample articles that came with the site carry a “Sample post — hidden on the site” tag; even when they show as published, they are not on the public page. Replace them with your own text and save, or press “Show on the site”. Archive them if they are not needed.')}</li>
              <li>{T('লেখার বক্সের উপরের বোতাম: H শিরোনাম, h ছোট শিরোনাম, B গাঢ়, I বাঁকা, বুলেট ও নম্বর তালিকা, উদ্ধৃতি, লিংক, লেখার ভেতরে ছবি (ছবি বেছে নিলেই উঠে যায় ও কার্সারের জায়গায় বসে; নিচে ছবির বর্ণনা দেখায়, বদলাতে চাইলে [ ] এর ভেতরের লেখা বদলান) এবং ভাগ করার রেখা। শব্দ বেছে বোতাম চাপুন, অথবা বোতাম চেপে লিখুন।', 'The buttons above the writing box: H heading, h subheading, B bold, I italic, bulleted and numbered lists, quote, link, picture in the text (choose one and it uploads and sits where the cursor is; its description shows under it, change the words inside [ ] to change it) and divider. Select words and press a button, or press a button and type.')}</li>
              <li>{T('“প্রিভিউ” চাপলে সাইটে যেমন দেখাবে তেমন দেখায়; “বড় করে লিখুন” লেখার জায়গা বড় করে। Ctrl+B গাঢ়, Ctrl+I বাঁকা, Ctrl+K লিংক, Ctrl+Z আগের অবস্থা। তালিকায় Enter চাপলে পরের বিষয় নিজে থেকে শুরু হয়; খালি বিষয়ে আবার Enter চাপলে তালিকা শেষ।', '“Preview” shows it as the site will; “Write large” makes the writing space big. Ctrl+B bold, Ctrl+I italic, Ctrl+K link, Ctrl+Z undo. In a list, Enter starts the next item; Enter on an empty item ends the list.')}</li>
              <li>{T('সুন্দর দেখাতে: একটি ভালো প্রচ্ছদ ছবি, ১–২ লাইনের সারাংশ, ছোট ছোট অনুচ্ছেদ, মাঝে মাঝে শিরোনাম ও একটি-দুটি ছবি দিন। সদস্যরাও ফর্মে একই বোতাম পান (লেখার ভেতরে ছবি ছাড়া; তাঁরা ছবি আলাদা করে দেন)।', 'To look its best: a good cover picture, a one- or two-line summary, short paragraphs, a heading now and then and a picture or two. Members get the same buttons in their form (except the picture in the text; they add pictures separately).')}</li>
              <li>{T('পুরোনো লেখা মুছে না ফেলে আর্কাইভ করা ভালো; প্রয়োজনে ফিরিয়ে আনা যায়।', 'Archive old articles instead of deleting them; they can be brought back.')}</li>
              <li>{T('ঐতিহাসিক তথ্য লিখলে উৎস উল্লেখ করুন।', 'Cite the source when writing historical facts.')}</li>
              <li>{T('ঐতিহাসিক স্থানের ছবিও “একসাথে অনেক ছবি যোগ করুন” দিয়ে একবারে দেওয়া যায় (সর্বোচ্চ ১২টি); প্রথম ছবিটি কভার।', 'A place’s photos can also be added many at once with “Add many photos at once” (up to 12); the first is the cover.')}</li>
            </ul>
          </section>

          <section id="m-committee">
            <h2>{T('কার্যনির্বাহী কমিটি', 'Executive committee')} <Go to="/admin?tab=committee">{open}</Go></h2>
            <ol>
              <li>{T('নতুন মেয়াদের জন্য একটি কমিটি তৈরি করুন (নাম, মেয়াদ, শুরু ও শেষের তারিখ)।', 'Create a committee for the new term (name, term, start and end date).')}</li>
              <li>{T('সদস্য যোগ করুন: নাম, পদবি, ছবি ও ক্রম। সভাপতি ও সাধারণ সম্পাদক সবার আগে দেখান।', 'Add members: name, post, photo and order. Show the president and general secretary first.')}</li>
              <li>{T('কমিটি সক্রিয় করলে সেটিই সাইটের কমিটি পাতায় দেখাবে; আগের কমিটি সংরক্ষিত থাকে।', 'Activating a committee makes it the one on the site’s Committee page; earlier committees are kept.')}</li>
              <li>{T('নতুন বছরের কমিটি: “নতুন কমিটি” চেপে খসড়া হিসেবে তৈরি করুন এবং ধীরে ধীরে সদস্য যোগ করুন — এর মধ্যে সাইটে পুরোনো কমিটিই দেখাবে। প্রস্তুত হলে “প্রকাশ করুন” চাপুন: সাইটে নতুন কমিটি দেখাবে আর পুরোনোটি নিজে থেকে আর্কাইভ হবে (মুছবে না)। চাইলে যেকোনো সময় “আর্কাইভ” বোতামেও পুরোনো কমিটি সরানো যায়।', 'Next year’s committee: press “New committee” to create it as a draft and add members over time — meanwhile the site keeps showing the current one. When ready, press “Publish”: the site shows the new committee and the old one is archived on its own (not deleted). An old committee can also be moved away any time with “Archive”.')}</li>
              <li>{T('আর্কাইভ করা কমিটি শুধু পড়া যায়। আবার সম্পাদনা করতে (যেমন ভুল করে আর্কাইভ হলে, বা পরের বছরের কমিটি) “খসড়া হিসেবে ফিরিয়ে আনুন” চাপুন; সাইটে যা দেখাচ্ছে তা বদলায় না।', 'An archived committee is read-only. To edit it again (archived by mistake, or next year’s committee), press “Restore as a draft”; what the site shows does not change.')}</li>
              <li>{T('দুই ভাষায়: কমিটির ফর্মে “বাংলা / English” বোতাম দিয়ে নাম, মেয়াদ ও পরিচিতি ইংরেজিতেও লিখুন; সদস্যের ফর্মে “ইংরেজিতে (ঐচ্ছিক)” অংশে পদবি, পরিচিতি ও মতামত। ইংরেজি ঘর খালি থাকলে ইংরেজি সাইটে বাংলা লেখাটি দেখায়।', 'In both languages: in the committee form, use “বাংলা / English” to write the name, term and introduction in English too; in a member’s form, the “In English (optional)” part holds the designation, introduction and message. An empty English box shows the Bangla text on the English site.')}</li>
              <li>{T('প্রতিটি সদস্যের “পরিচয় ও মতামত” অংশে বিভাগ, ব্যাচ, সেশন, উপজেলা ও সদস্যের নিজের কথা (মতামত) লিখুন। দর্শক সদস্যের নামে চাপলে পপ-আপে এগুলো শিক্ষার্থীর প্রোফাইলের মতো দেখায়; মতামত উদ্ধৃতি হিসেবে আসে। নিবন্ধিত সদস্য হলে খালি ঘরগুলো তাঁর অনুমোদিত প্রোফাইল থেকে নেওয়া হয়। ফোন বা ইমেইল কখনো দেখানো হয় না।', 'In each member’s “Identity and message” part, write the department, batch, session, upazila and the member’s message. When a visitor presses the member’s name, the pop-up shows these like a student’s profile; the message appears as a quote. For a registered member, empty boxes are taken from their approved profile. A phone number or email is never shown.')}</li>
            </ol>
            <p>{T('সাইটের কমিটি পাতায় কার্ডে পরিচিতির (Bio) প্রথম কয়েক লাইন দেখায়। দর্শক কোনো সদস্যের কার্ডে ক্লিক করলে একটি পপ-আপে বড় ছবি (ক্লিক করে আরও বড় করা যায়), নাম, পদবি, গ্রুপ, কমিটির নাম ও মেয়াদ এবং পুরো পরিচিতি দেখায়। তাই প্রতিটি সদস্যের পরিচিতি লিখে রাখা ভালো।',
              'On the site’s Committee page the cards show the first lines of the introduction (Bio). When a visitor clicks a member’s card, a pop-up shows a large photo (a click enlarges it further), the name, post, group, the committee and its term, and the whole introduction. So it is worth writing an introduction for every member.')}</p>
          </section>

          <section id="m-blog-submissions">
            <h2>{T('সদস্যদের পাঠানো লেখা', 'Writing sent by members')} <Go to="/admin/blog-submissions">{open}</Go></h2>
            <p>{T('ব্লগ পাতার নিচে “ব্লগে লেখা পাঠান” ফর্ম আছে। নিবন্ধিত সদস্যরা প্রবেশ করে শিরোনাম, লেখা ও একসাথে সর্বোচ্চ ৬টি ছবি পাঠাতে পারেন। সব কিছু ডাটাবেসে জমা হয় এবং বাঁ পাশের মেনুর “সদস্যদের লেখা” পাতায় দেখায়। প্রকাশ না করা পর্যন্ত কিছুই সাইটে দেখায় না।',
              'At the bottom of the Blog page there is a “Write for the blog” form. Registered members sign in and send a title, the text and up to 6 pictures at once. Everything is saved in the database and shows on the “Members’ writing” page in the left menu. Nothing shows on the site until you publish it.')}</p>
            <ol>
              <li>{T('“নতুন” ট্যাবে নতুন লেখাগুলো থাকে। একটিতে চাপলে পুরো লেখা ও ছবি খোলে (খুললেই “পড়া হয়েছে” হয়ে যায়)।', 'The “New” tab holds new pieces. Press one to open the whole text and its pictures (opening marks it “Read”).')}</li>
              <li>{T('ছবিতে চাপলে বড় করে দেখা যায়; “ডাউনলোড” চাপলে কম্পিউটারে রাখা যায়।', 'Press a picture to see it larger; “Download” keeps it on your computer.')}</li>
              <li>{T('লেখাটি প্রকাশযোগ্য হলে “অনুমোদন দিন ও প্রকাশ করুন” চাপুন: লেখকের নাম ও ছবিসহ লেখাটি সাথে সাথে ব্লগ পাতায় প্রকাশিত হয়, আর সদস্য তাঁর তালিকায় “প্রকাশিত” ও “পড়ুন” লিংক দেখেন।', 'If the piece can be published, press “Approve and publish”: it goes on the Blog page at once with the writer’s name and pictures, and the member sees “Published” and a “Read it” link in their list.')}</li>
              <li>{T('প্রকাশের আগে বানান বা শিরোনাম ঠিক করতে চাইলে “ব্লগের খসড়া বানান” চাপুন। লেখকের নাম, লেখা ও ছবি দিয়ে ব্লগে একটি অপ্রকাশিত খসড়া তৈরি হয় এবং সেটি খুলে যায়; প্রথম ছবিটি প্রচ্ছদ, বাকি ছবি লেখার শেষে থাকে।', 'To fix spelling or the title before publishing, press “Make a blog draft” instead. An unpublished blog draft is made with the writer’s name, the text and the pictures, and it opens; the first picture is the cover, the others go at the end of the text.')}</li>
              <li>{T('খসড়ায় বানান, শিরোনাম, বিভাগ ও ইংরেজি অংশ ঠিক করে “প্রকাশ” চাপুন (ব্লগ অংশ দেখুন); অথবা এই পাতায় ফিরে “অনুমোদন দিন ও প্রকাশ করুন” চাপুন।', 'In the draft, fix spelling, the title, the category and the English part, then press “Publish” (see the Blog part), or come back here and press “Approve and publish”.')}</li>
              <li>{T('প্রকাশ না করার হলে “প্রকাশ হবে না” চাপুন; সদস্য তাঁর পাতায় সেটি দেখবেন। স্প্যাম বা অপ্রয়োজনীয় হলে “মুছে ফেলুন”।', 'If it is not to be published, press “Not to publish”; the member sees that on their side. Delete spam or pieces that are not needed.')}</li>
            </ol>
            <p className="man-note">{T('সদস্য ব্লগ পাতায় “আমার পাঠানো লেখা”-তে নিজের লেখার অবস্থা দেখেন (পাঠানো হয়েছে / পড়া হয়েছে / প্রকাশের জন্য নেওয়া হয়েছে / এবার প্রকাশ হচ্ছে না)। একজন সদস্য দিনে সর্বোচ্চ ৫টি লেখা পাঠাতে পারেন। লেখা আসলে কোনো ইমেইল আসে না; নিয়মিত এই পাতা দেখুন।',
              'Members see the state of their pieces under “My sent writing” on the Blog page (Sent / Read / Taken for publishing / Not published this time). A member can send at most 5 pieces a day. No email arrives for a new piece; check this page regularly.')}</p>
          </section>

          <section id="m-contact">
            <h2>{T('যোগাযোগ বার্তা', 'Contact messages')} <Go to="/admin/contact">{open}</Go></h2>
            <p>{T('সাইটের যোগাযোগ ফর্ম থেকে আসা বার্তা এখানে জমা হয়। বার্তা খুলে পড়ুন, উত্তর দিতে প্রেরকের ইমেইল বা ফোনে যোগাযোগ করুন, তারপর পঠিত চিহ্ন দিন। স্প্যাম হলে মুছে ফেলুন।',
              'Messages from the site’s contact form collect here. Open and read one, reply through the sender’s email or phone, then mark it read. Delete spam.')}</p>
            <p className="man-note">{T('বার্তা আসলে কোনো ইমেইল আসে না; নিয়মিত এই পাতা দেখুন। নতুন বার্তার সংখ্যা ড্যাশবোর্ডে ও এই পাতার “নতুন” ট্যাবে দেখায়। প্রতিটি বার্তা ৩০ দিন পর নিজে থেকেই মুছে যায়।',
              'No email arrives for a message; check this page regularly. The number of new messages shows on the dashboard and on this page’s “New” tab. Every message is deleted on its own after 30 days.')}</p>
          </section>

          <section id="m-roles">
            <h2>{T('অ্যাডমিন ও ভূমিকা', 'Admins and roles')} <Go to="/admin?tab=roles">{open}</Go></h2>
            <p>{T('কোনো সদস্যকে অ্যাডমিন করতে তাঁর নাম খুঁজে ভূমিকা অ্যাডমিন করুন; অ্যাডমিন থেকে সরাতে আবার সদস্য করুন। কে কখন কার ভূমিকা বদলেছে তার ইতিহাস পাতার নিচে থাকে।',
              'To make a member an admin, find their name and set the role to Admin; set it back to Member to remove admin rights. The history of who changed whose role and when is at the bottom of the page.')}</p>
            <p className="man-note">{T('অ্যাডমিন সব ব্যক্তিগত তথ্য দেখতে ও বদলাতে পারেন। শুধু কমিটির দায়িত্বপ্রাপ্ত, বিশ্বস্ত মানুষকে অ্যাডমিন করুন, এবং দায়িত্ব শেষ হলে ভূমিকা সরিয়ে দিন।',
              'Admins can see and change all private details. Make only responsible, trusted committee members admins, and remove the role when their duty ends.')}</p>
          </section>

          <section id="m-faq">
            <h2>{T('প্রশ্নোত্তর ও রেফারেন্স তথ্য', 'FAQ and reference data')} <Go to="/admin/faq">{T('প্রশ্নোত্তর', 'FAQ')}</Go> <Go to="/admin/places-data">{T('রেফারেন্স', 'Reference')}</Go></h2>
            <p>{T('যোগাযোগ পাতার সাধারণ প্রশ্ন ও উত্তর প্রশ্নোত্তর থেকে বদলান। বিভাগ ও উপজেলা/ইউনিয়নের তালিকা (যা নিবন্ধন ফর্মে দেখায়) রেফারেন্স তথ্য থেকে হালনাগাদ করুন।',
              'Change the common questions and answers on the Contact page under FAQ. Update the lists of departments and upazilas/unions (shown in the sign-up form) under Reference data.')}</p>
          </section>

          <section id="m-rules">
            <h2>{T('নিয়ম ও সতর্কতা', 'Rules and cautions')}</h2>
            <ul>
              <li>{T('ব্যক্তিগত তথ্য: ফোন, ইমেইল ও রক্তের গ্রুপ সাধারণ দর্শকদের দেখানো হয় না, শুধু লগইন করা সদস্যরা দেখেন। এই তথ্য সংগঠনের কাজের বাইরে কাউকে দেবেন না।', 'Private details: phone, email and blood group are not shown to ordinary visitors, only to signed-in members. Do not give them to anyone outside the association’s work.')}</li>
              <li>{T('মুছে ফেলা: মুছে ফেলা তথ্য সাধারণত ফেরত আনা যায় না। সন্দেহ থাকলে মুছে না ফেলে লুকান বা আর্কাইভ করুন।', 'Deleting: deleted data usually cannot be brought back. When in doubt, hide or archive instead.')}</li>
              <li>{T('পাসওয়ার্ড: নিজের অ্যাডমিন পাসওয়ার্ড কারও সাথে ভাগ করবেন না। পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হয়, তবে অ্যাডমিন অ্যাকাউন্টে লম্বা ও অনুমান করা কঠিন পাসওয়ার্ড ব্যবহার করুন।', 'Password: never share your admin password. A password needs at least 6 characters, but use a long, hard-to-guess one for an admin account.')}</li>
              <li>{T('ছবি: স্পষ্ট, শালীন ও অনুমতি আছে এমন ছবি ব্যবহার করুন। প্রতিটি মূল ছবি ১৫ MB-এর মধ্যে রাখুন।', 'Pictures: use clear, decent pictures you have permission for. Keep each original under 15 MB.')}</li>
              <li>{T('ভুল হলে: কার্যক্রম পাতায় দেখে নিন কী বদলেছে, তারপর সম্পাদনা করে ঠিক করুন। সমাধান না হলে সাইটের ডেভেলপারকে জানান।', 'If something goes wrong: check the Activity page to see what changed, then edit to fix it. If it is not solved, tell the site’s developer.')}</li>
            </ul>
          </section>

          <section id="m-editable">
            <h2>{T('কী কী বদলানো যায়', 'What can be changed')}</h2>
            <p>{T('সাইটের প্রায় সবকিছু কোড ছাড়াই অ্যাডমিন প্যানেল থেকে বদলানো যায়:', 'Almost everything on the site is changed from the admin panel, without code:')}</p>
            <ul>
              <li><b>{T('লেখা', 'Words')}</b> — <Go to="/admin/site-texts">{T('ওয়েবসাইটের লেখা', 'Website texts')}</Go>: {T('মেনু, ফুটার, প্রতিটি পাতার শিরোনাম ও বর্ণনা, বোতাম, বার্তা, হোম পেজের “আমাদের কথা” ও সংখ্যার অংশ, হিরোর নাম, ঐতিহ্য পাতার কার্ড।', 'menu, footer, every page’s headings and descriptions, buttons, messages, Home’s “About us” and numbers, the hero name, the Heritage cards.')}</li>
              <li><b>{T('ছবি ও ভিডিও', 'Pictures and videos')}</b> — <Go to="/admin/site-images">{T('সাইটের ছবি', 'Site pictures')}</Go>: {T('হোম স্লাইড (ছবি, ভিডিও, YouTube), প্রতিটি পাতার উপরের ছবি, পাতার ভেতরের ছবি, গ্যালারির ফিচার্ড ছবি, লোগো ও স্কেচ।', 'home slides (pictures, videos, YouTube), the picture at the top of each page, pictures inside pages, the gallery’s featured picture, the logo and sketches.')}</li>
              <li><b>{T('বিষয়বস্তু', 'Content')}</b> — {T('ইভেন্ট, ব্লগ, ঐতিহ্য, গ্যালারি, কমিটি, প্রশ্নোত্তর, শিক্ষার্থী, অ্যালামনাই, উপজেলা ও বিভাগ: প্রতিটির নিজের পাতা থেকে।', 'events, blog, heritage, gallery, committee, FAQ, students, alumni, upazilas and departments: each from its own page.')}</li>
            </ul>
            <p className="muted small">{T('ডিজাইনের অংশ হিসেবে যা বদলায় না: পাতার উপরের ছবির চারপাশের ছোট পাতা ও ফুলের নকশা, রং ও ফন্ট, ব্রাউজার ট্যাবের আইকন এবং ইমেইলের নকশা।', 'Fixed as part of the design: the small leaf and flower ornaments around page-top pictures, colours and fonts, the browser-tab icon and the email designs.')}</p>
          </section>

          <section id="m-visitors">
            <h2>{T('দর্শকদের জন্য সুবিধা', 'What visitors get')}</h2>
            <ul>
              <li>{T('লম্বা পাতায় নিচে নামলে ডান কোণে “উপরে যান” বোতাম আসে।', 'On long pages a “Back to top” button appears in the bottom corner.')}</li>
              <li>{T('ফোনে ব্রাউজারের মেনু থেকে “Add to Home screen / Install” চাপলে সাইটটি অ্যাপের মতো হোম স্ক্রিনে বসে যায় (BSWA নামে, লোগোসহ)।', 'On a phone, “Add to Home screen / Install” in the browser menu puts the site on the home screen like an app (named BSWA, with the logo).')}</li>
              <li>{T('বাংলা/English, আলো/অন্ধকার মোড, সার্চ (শিক্ষার্থী, অ্যালামনাই, স্থান, ইভেন্ট), প্রোফাইল পপ-আপ, ছবি বড় করে দেখা, ইভেন্ট শেয়ার ও ক্যালেন্ডার।', 'Bangla/English, light/dark mode, search (students, alumni, places, events), profile pop-ups, enlarging photos, sharing events and adding them to a calendar.')}</li>
            </ul>
          </section>

          <section id="m-handover">
            <h2>{T('হস্তান্তর ও রক্ষণাবেক্ষণ', 'Handover and upkeep')}</h2>
            <h3>{T('সাইট কোথায় চলে', 'Where the site runs')}</h3>
            <ul>
              <li>{T('ওয়েবসাইট (যা দর্শক দেখেন): Cloudflare Pages। GitHub-এ নতুন কোড গেলে নিজে থেকেই আপডেট হয়।', 'The website (what visitors see): Cloudflare Pages. It updates on its own when new code reaches GitHub.')}</li>
              <li>{T('সার্ভার (API): Render। নতুন কোড গেলে Render-এ নতুন “Deploy” হতে হয়; Auto-Deploy বন্ধ থাকলে Render ড্যাশবোর্ড থেকে “Manual Deploy” চাপুন।', 'The server (API): Render. New code needs a new Render “Deploy”; if Auto-Deploy is off, press “Manual Deploy” in the Render dashboard.')}</li>
              <li>{T('ডেটাবেস, লগইন ও ছবি-ভিডিও রাখার জায়গা: Supabase।', 'Database, sign-in and picture/video storage: Supabase.')}</li>
            </ul>
            <h3>{T('একবার করে রাখার কাজ', 'One-time setup')}</h3>
            <ol>
              <li>{T('ভিডিও ফাইল আপলোডের জন্য: Supabase › SQL Editor-এ backend/storage/executive_photos.sql ফাইলটি একবার চালান (এটি শুধু “site-video” জায়গা তৈরি করে, কিছু মোছে না)। YouTube লিংক এটি ছাড়াই চলে।', 'For video file uploads: run backend/storage/executive_photos.sql once in Supabase › SQL Editor (it only creates the “site-video” storage, it deletes nothing). YouTube links work without it.')}</li>
              <li>{T('Supabase › Authentication: পাসওয়ার্ডের সর্বনিম্ন দৈর্ঘ্য ৬; Site URL হবে সাইটের ঠিকানা; Emails › SMTP Settings-এ যে Gmail থেকে নিবন্ধন ও পাসওয়ার্ড-রিসেটের মেইল যাবে তার App Password।', 'Supabase › Authentication: minimum password length 6; Site URL set to the site’s address; Emails › SMTP Settings with the Gmail App Password that sends sign-up and password-reset mail.')}</li>
              <li>{T('ইমেইলের নকশা: docs/email-templates ফোল্ডারের তিনটি ফাইল Supabase › Emails › Templates-এ (Confirm signup, Invite user, Reset password) বসানো আছে কিনা দেখুন।', 'Email designs: check that the three files in docs/email-templates are in Supabase › Emails › Templates (Confirm signup, Invite user, Reset password).')}</li>
            </ol>
            <h3>{T('সব ঠিক আছে কিনা দেখা', 'Checking that all is well')}</h3>
            <ul>
              <li>{T('সার্ভার চালু আছে কিনা: সার্ভারের ঠিকানার শেষে /api/v1/health খুলুন; “ok” দেখাবে, আর “version”-এ শেষ যে কোড চালু হয়েছে তার নম্বর।', 'Is the server up: open the server address followed by /api/v1/health; it shows “ok”, and “version” is the code that is running.')}</li>
              <li>{T('Render-এর বিনামূল্যের প্ল্যানে অনেকক্ষণ কেউ না এলে সার্ভার ঘুমিয়ে যায়; তখন প্রথম পাতা খুলতে ৩০-৬০ সেকেন্ড লাগতে পারে। এটি স্বাভাবিক।', 'On Render’s free plan the server sleeps when nobody visits for a while; the first page may then take 30-60 seconds. This is normal.')}</li>
              <li>{T('Render-এর বিনামূল্যের প্ল্যানে ইমেইল পাঠানো (SMTP) বন্ধ, তাই যোগাযোগ ফর্মের বার্তা শুধু অ্যাডমিন প্যানেলে জমা হয়। নিবন্ধন ও পাসওয়ার্ডের মেইল Supabase পাঠায়, তাই সেগুলো চলে।', 'Sending email (SMTP) is blocked on Render’s free plan, so contact messages are kept in the admin panel only. Sign-up and password mail is sent by Supabase, so it works.')}</li>
            </ul>
            <h3>{T('নতুন অ্যাডমিন ও দায়িত্ব বদল', 'New admins and changing hands')}</h3>
            <ul>
              <li>{T('নতুন কমিটি এলে: নতুনদের সাইটে নিবন্ধন করতে বলুন, তারপর “অ্যাডমিন ব্যবস্থাপনা” থেকে তাঁদের অ্যাডমিন করুন। পুরোনোদের অ্যাডমিন ভূমিকা সরিয়ে দিন।', 'When a new committee comes in: ask the new people to register on the site, then make them admins under “Admin management”. Remove the old admins’ role.')}</li>
              <li>{T('Supabase, Render, Cloudflare, GitHub ও Gmail অ্যাকাউন্টের পাসওয়ার্ড সংগঠনের দায়িত্বশীল দুইজনের কাছে নিরাপদে রাখুন; কাজ ছাড়ার সময় পাসওয়ার্ড বদলে দিন।', 'Keep the passwords of the Supabase, Render, Cloudflare, GitHub and Gmail accounts safely with two responsible people of the association; change them when someone leaves.')}</li>
              <li>{T('গোপন কী (secret key, App Password) কখনো কাউকে মেসেজে বা চ্যাটে পাঠাবেন না; শুধু ড্যাশবোর্ডের সেটিংসে বসান।', 'Never send secret keys or App Passwords in messages or chats; only enter them in the dashboards’ settings.')}</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
