import { useState } from 'react'
import { Link } from 'react-router-dom'
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

  const SECTIONS = [
    ['start', T('শুরু করার আগে', 'Before you start')], ['dashboard', T('ড্যাশবোর্ড', 'Dashboard')],
    ['requests', T('সদস্যপদের আবেদন', 'Membership requests')], ['directory', T('সদস্য ডিরেক্টরি', 'Member directory')],
    ['alumni', T('অ্যালামনাই', 'Alumni')], ['photos', T('মানুষের ছবি যোগ করা', 'Adding people’s photos')],
    ['site-images', T('সাইটের ছবি ও হোম স্লাইড', 'Site pictures and home slides')], ['gallery', T('গ্যালারি', 'Gallery')],
    ['events', T('ইভেন্ট', 'Events')], ['blog', T('ব্লগ ও ঐতিহ্য', 'Blog and heritage')],
    ['committee', T('কার্যনির্বাহী কমিটি', 'Executive committee')], ['contact', T('যোগাযোগ বার্তা', 'Contact messages')],
    ['roles', T('অ্যাডমিন ও ভূমিকা', 'Admins and roles')], ['faq', T('প্রশ্নোত্তর ও রেফারেন্স তথ্য', 'FAQ and reference data')],
    ['rules', T('নিয়ম ও সতর্কতা', 'Rules and cautions')],
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
              <li>{T('ডিভাইস থেকে আপলোড: বোতামটি চেপে কম্পিউটার বা ফোন থেকে JPG/PNG ছবি বেছে নিন (সর্বোচ্চ ৫ MB)।', 'Upload from the device: press the button and choose a JPG/PNG picture from your computer or phone (up to 5 MB).')}</li>
              <li>{T('ছবির লিংক: গুগল ড্রাইভের লিংক দিলে ছবিটি অবশ্যই “Anyone with the link” হিসেবে শেয়ার করা থাকতে হবে।', 'Photo link: for a Google Drive link the file must be shared as “Anyone with the link”.')}</li>
            </ol>
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
            <p>{T('কোনো স্লাইড প্রকাশিত না থাকলে সাইট নিজের চারটি ডিফল্ট ছবি দেখায়। চওড়া (ল্যান্ডস্কেপ) ও পরিষ্কার ছবি ব্যবহার করুন, অন্তত ১৬০০ পিক্সেল চওড়া।',
              'If no slide is published, the site shows its four built-in pictures. Use wide (landscape), clear pictures, at least 1600 pixels wide.')}</p>
            <h3>{T('প্রতিটি পাতার উপরের ছবি', 'The picture at the top of each page')}</h3>
            <p>{T('শিক্ষার্থী, অ্যালামনাই, কমিটি, ইভেন্ট, গ্যালারি, ঐতিহ্য, ব্লগ ইত্যাদি পাতার শুরুতে যে ছবি থাকে তা এখান থেকে বদলানো যায়। যে পাতার ছবি বদলাতে চান শুধু সেটিতে ছবি দিন; খালি রাখলে ডিফল্ট ছবি থাকবে।',
              'The picture at the start of the Students, Alumni, Committee, Events, Gallery, Heritage, Blog and other pages can be changed here. Set a picture only for the pages you want to change; empty means the built-in picture stays.')}</p>
            <h3>{T('গ্যালারির ফিচার্ড ছবি ও “ঘুরে দেখুন ব্রাহ্মণবাড়িয়া”', 'Gallery featured picture and “Explore Brahmanbaria”')}</h3>
            <p>{T('গ্যালারি পাতার শুরুতে বড় করে দেখানোর জন্য একটি ফিচার্ড ছবি বেছে নিতে পারেন। হোম পেজের “ঘুরে দেখুন ব্রাহ্মণবাড়িয়া” অংশের ছবিও এখান থেকে বদলায়।',
              'Choose a featured picture to show large at the start of the Gallery page. The “Explore Brahmanbaria” picture on the home page is changed here too.')}</p>
          </section>

          <section id="m-gallery">
            <h2>{T('গ্যালারি', 'Gallery')} <Go to="/admin/gallery">{open}</Go></h2>
            <ol>
              <li>{T('ছবি যোগ করুন চেপে ছবি আপলোড করুন বা লিংক দিন।', 'Press Add picture and upload one or give a link.')}</li>
              <li>{T('ক্যাপশন (বাংলা ও ইংরেজি), ছবির বর্ণনা (alt), কৃতজ্ঞতা/উৎস এবং চাইলে অ্যালবাম বেছে দিন।', 'Give captions (Bangla and English), a description (alt), credit/source and, if you want, an album.')}</li>
              <li>{T('প্রকাশ করলে ছবিটি গ্যালারি পাতায় দেখা যাবে; লুকান করলে সরে যাবে কিন্তু মুছবে না।', 'Publishing shows the picture on the Gallery page; hiding removes it from view without deleting it.')}</li>
              <li>{T('অ্যালবাম তৈরি করে ছবিগুলো অনুষ্ঠান অনুযায়ী ভাগ করা যায়; টেনে বা তীর দিয়ে ক্রম বদলানো যায়।', 'Create albums to group pictures by occasion; change the order by dragging or with the arrows.')}</li>
            </ol>
            <p className="man-note">{T('অন্যের তোলা ছবি দিলে অনুমতি আছে কিনা নিশ্চিত হোন এবং কৃতজ্ঞতার ঘরে নাম লিখুন।', 'If a picture was taken by someone else, make sure you have permission and write their name in the credit field.')}</p>
          </section>

          <section id="m-events">
            <h2>{T('ইভেন্ট', 'Events')} <Go to="/admin/events">{open}</Go></h2>
            <ol>
              <li>{T('যোগ করুন চেপে শিরোনাম, তারিখ, সময়, স্থান ও বিবরণ লিখুন।', 'Press Add and write title, date, time, place and description.')}</li>
              <li>{T('একটি প্রধান ছবি দিন; অনুষ্ঠানের পর আরও ছবি (সর্বোচ্চ ২৪টি) যোগ করা যায়।', 'Give one main picture; after the event more pictures (up to 24) can be added.')}</li>
              <li>{T('প্রকাশ করলে ইভেন্টটি হোম পেজ ও ইভেন্ট পাতায় তারিখ অনুযায়ী দেখাবে।', 'Once published, the event shows on the home page and the Events page by date.')}</li>
            </ol>
          </section>

          <section id="m-blog">
            <h2>{T('ব্লগ ও ঐতিহ্য', 'Blog and heritage')} <Go to="/admin/blog">{T('ব্লগ', 'Blog')}</Go> <Go to="/admin/heritage">{T('ঐতিহ্য', 'Heritage')}</Go></h2>
            <p>{T('ব্লগে সংবাদ, ঘোষণা ও লেখা প্রকাশ করা যায়; ঐতিহ্য অংশে জেলার ঐতিহাসিক ও দর্শনীয় স্থানের তথ্য থাকে।', 'The blog carries news, announcements and articles; the heritage section holds the district’s historical and scenic places.')}</p>
            <ul>
              <li>{T('নতুন লেখা প্রথমে খসড়া হিসেবে থাকে; প্রস্তুত হলে প্রকাশ করুন।', 'A new article starts as a draft; publish it when it is ready.')}</li>
              <li>{T('পুরোনো লেখা মুছে না ফেলে আর্কাইভ করা ভালো; প্রয়োজনে ফিরিয়ে আনা যায়।', 'Archive old articles instead of deleting them; they can be brought back.')}</li>
              <li>{T('ঐতিহাসিক তথ্য লিখলে উৎস উল্লেখ করুন।', 'Cite the source when writing historical facts.')}</li>
            </ul>
          </section>

          <section id="m-committee">
            <h2>{T('কার্যনির্বাহী কমিটি', 'Executive committee')} <Go to="/admin?tab=committee">{open}</Go></h2>
            <ol>
              <li>{T('নতুন মেয়াদের জন্য একটি কমিটি তৈরি করুন (নাম, মেয়াদ, শুরু ও শেষের তারিখ)।', 'Create a committee for the new term (name, term, start and end date).')}</li>
              <li>{T('সদস্য যোগ করুন: নাম, পদবি, ছবি ও ক্রম। সভাপতি ও সাধারণ সম্পাদক সবার আগে দেখান।', 'Add members: name, post, photo and order. Show the president and general secretary first.')}</li>
              <li>{T('কমিটি সক্রিয় করলে সেটিই সাইটের কমিটি পাতায় দেখাবে; আগের কমিটি সংরক্ষিত থাকে।', 'Activating a committee makes it the one on the site’s Committee page; earlier committees are kept.')}</li>
            </ol>
          </section>

          <section id="m-contact">
            <h2>{T('যোগাযোগ বার্তা', 'Contact messages')} <Go to="/admin/contact">{open}</Go></h2>
            <p>{T('সাইটের যোগাযোগ ফর্ম থেকে আসা বার্তা এখানে জমা হয়। বার্তা খুলে পড়ুন, উত্তর দিতে প্রেরকের ইমেইল বা ফোনে যোগাযোগ করুন, তারপর পঠিত চিহ্ন দিন। স্প্যাম হলে মুছে ফেলুন।',
              'Messages from the site’s contact form collect here. Open and read one, reply through the sender’s email or phone, then mark it read. Delete spam.')}</p>
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
              <li>{T('পাসওয়ার্ড: নিজের অ্যাডমিন পাসওয়ার্ড কারও সাথে ভাগ করবেন না। পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হয়, তবে অ্যাডমিন অ্যাকাউন্টে লম্বা ও অনুমান করা কঠিন পাসওয়ার্ড ব্যবহার করুন।', 'Password: never share your admin password. A password needs at least 4 characters, but use a long, hard-to-guess one for an admin account.')}</li>
              <li>{T('ছবি: স্পষ্ট, শালীন ও অনুমতি আছে এমন ছবি ব্যবহার করুন। ছবির আকার ৫ MB-এর মধ্যে রাখুন।', 'Pictures: use clear, decent pictures you have permission for. Keep each under 5 MB.')}</li>
              <li>{T('ভুল হলে: কার্যক্রম পাতায় দেখে নিন কী বদলেছে, তারপর সম্পাদনা করে ঠিক করুন। সমাধান না হলে সাইটের ডেভেলপারকে জানান।', 'If something goes wrong: check the Activity page to see what changed, then edit to fix it. If it is not solved, tell the site’s developer.')}</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
