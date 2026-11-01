import type {
  BureauCode,
  Case,
  CaseAction,
  Category,
  Db,
  Institution,
  InstitutionType,
  InstitutionSignals,
  Officer,
  PulseAggregate,
  Region,
  Settings,
  Severity,
  Status,
  StudentAccount,
  StudentComplaint,
  StudentStatus,
} from "./types";
import { CATEGORIES } from "./types";
import { DAY, addDays, chance, int, iso, mulberry32, pick, weighted, type Rng } from "./util";
import { resolveInstitution } from "./resolve";
import { DEMO_COLLEGE_INDEX, DEMO_STUDENTS, PULSE_TERM, VOICE_SAMPLES, categoryOf, mockEvidence, pseudonymFor, severityOf } from "./intake";

export const SCHEMA_VERSION = 4;

export const DEFAULT_SETTINGS: Settings = {
  slaDays: {
    "Fee / Refund": 30,
    "Faculty Qualification": 60,
    Infrastructure: 60,
    "Admission Irregularity": 45,
    "Harassment / Ragging": 15,
    "Fake Affiliation Claim": 45,
    "Exam / Result": 30,
    "Placement Misrepresentation": 45,
  },
  reminderNoActionDays: 14,
  warningWindowDays: 5,
  overlapMinConfidence: 0.62,
  collegeReminders: { farDays: 7, nearDays: 3, finalDays: 1 },
  verifyWindowDays: 7,
  escalationGraceDays: 3,
};

export const ROUTING: Record<Category, BureauCode> = {
  "Fee / Refund": "PGRC",
  "Faculty Qualification": "AB",
  Infrastructure: "AB",
  "Admission Irregularity": "RB",
  "Harassment / Ragging": "ARC",
  "Fake Affiliation Claim": "RB",
  "Exam / Result": "PAPB",
  "Placement Misrepresentation": "PGRC",
};

// ---------- institutions ----------
type Row = [string, InstitutionType, Region, string, string];
const ROWS: Row[] = [
  ["Shivalik Ridge", "Engineering", "North-Western", "Himachal Pradesh", "Solan"],
  ["Godavari Delta", "Engineering", "Southern", "Andhra Pradesh", "Rajahmundry"],
  ["Aravalli Crest", "Management", "Central", "Rajasthan", "Udaipur"],
  ["Sahyadri Vista", "Engineering", "Western", "Maharashtra", "Nashik"],
  ["Narmada Tejas", "Engineering", "Central", "Madhya Pradesh", "Jabalpur"],
  ["Kaveri Pragati", "Engineering", "Southern", "Tamil Nadu", "Tiruchirappalli"],
  ["Vindhya Shikhar", "Pharmacy", "Central", "Madhya Pradesh", "Rewa"],
  ["Brahmaputra Valley", "Engineering", "North-Eastern", "Assam", "Guwahati"],
  ["Malabar Coastline", "Management", "South-Western", "Kerala", "Kozhikode"],
  ["Deccan Plateau", "Engineering", "Southern", "Telangana", "Warangal"],
  ["Satpura Greens", "Polytechnic", "Central", "Madhya Pradesh", "Betul"],
  ["Nilgiri Heights", "Pharmacy", "Southern", "Tamil Nadu", "Udhagamandalam"],
  ["Konark Suryodaya", "Engineering", "Eastern", "Odisha", "Puri"],
  ["Tapti Riverside", "Engineering", "Western", "Gujarat", "Surat"],
  ["Gangotri Gyanpeeth", "Engineering", "Northern", "Uttarakhand", "Dehradun"],
  ["Chinar Valley", "Management", "North-Western", "Jammu & Kashmir", "Srinagar"],
  ["Thar Horizon", "Engineering", "Central", "Rajasthan", "Jodhpur"],
  ["Sundarban Delta", "Polytechnic", "Eastern", "West Bengal", "Baruipur"],
  ["Kanchenjunga Vista", "Engineering", "Eastern", "West Bengal", "Siliguri"],
  ["Mahanadi Unnati", "Engineering", "Eastern", "Odisha", "Cuttack"],
  ["Krishna Tejaswi", "Engineering", "Southern", "Andhra Pradesh", "Vijayawada"],
  ["Tungabhadra Prerana", "Engineering", "South-Western", "Karnataka", "Ballari"],
  ["Western Ghats Sahyog", "Architecture", "South-Western", "Karnataka", "Mangaluru"],
  ["Eastern Ghats Unnati", "Engineering", "Southern", "Andhra Pradesh", "Visakhapatnam"],
  ["Chambal Valley", "Polytechnic", "Central", "Madhya Pradesh", "Gwalior"],
  ["Yamuna Vihar", "Management", "Northern", "Delhi", "New Delhi"],
  ["Saraswati Vidyapeeth", "Engineering", "Northern", "Uttar Pradesh", "Prayagraj"],
  ["Luni Basin", "Pharmacy", "Central", "Rajasthan", "Pali"],
  ["Barak Valley", "Engineering", "North-Eastern", "Assam", "Silchar"],
  ["Pennar Prakash", "Engineering", "Southern", "Andhra Pradesh", "Nellore"],
  ["Vaigai Valley", "Engineering", "Southern", "Tamil Nadu", "Madurai"],
  ["Periyar Lakeview", "Pharmacy", "South-Western", "Kerala", "Idukki"],
  ["Sabarmati Riverfront", "Management", "Western", "Gujarat", "Ahmedabad"],
  ["Mandovi Coast", "Architecture", "Western", "Goa", "Panaji"],
  ["Bhima Sangam", "Engineering", "Western", "Maharashtra", "Solapur"],
  ["Indravati Vanjyoti", "Engineering", "Central", "Chhattisgarh", "Jagdalpur"],
  ["Betwa Gyanodaya", "Engineering", "Northern", "Uttar Pradesh", "Jhansi"],
  ["Sone Valley", "Polytechnic", "Eastern", "Bihar", "Sasaram"],
  ["Damodar Prerna", "Engineering", "Eastern", "Jharkhand", "Dhanbad"],
  ["Teesta Ridge", "Management", "North-Eastern", "Sikkim", "Gangtok"],
  ["Loktak Lakeside", "Polytechnic", "North-Eastern", "Manipur", "Imphal"],
  ["Umiam Highlands", "Engineering", "North-Eastern", "Meghalaya", "Shillong"],
  ["Ghaghara Plains", "Engineering", "Northern", "Uttar Pradesh", "Gorakhpur"],
  ["Ramganga Vatika", "Pharmacy", "Northern", "Uttar Pradesh", "Bareilly"],
  ["Sutlej Valley", "Engineering", "North-Western", "Punjab", "Ludhiana"],
  ["Ghaggar Plains", "Management", "North-Western", "Haryana", "Panchkula"],
  ["Ravi Pragya", "Engineering", "North-Western", "Punjab", "Amritsar"],
  ["Jhelum Crest", "Engineering", "North-Western", "Jammu & Kashmir", "Jammu"],
  ["Kosi Vikas", "Engineering", "Eastern", "Bihar", "Purnia"],
  ["Subarnarekha Udaya", "Engineering", "Eastern", "Jharkhand", "Jamshedpur"],
  ["Netravati Sagara", "Engineering", "South-Western", "Karnataka", "Udupi"],
  ["Sharavathi Jyothi", "MCA", "South-Western", "Karnataka", "Shivamogga"],
  ["Kabini Riverside", "Engineering", "South-Western", "Karnataka", "Mysuru"],
  ["Bhavani Sagar", "Engineering", "Southern", "Tamil Nadu", "Erode"],
  ["Palar Valley", "Engineering", "Southern", "Tamil Nadu", "Vellore"],
  ["Musi Riverside", "Engineering", "Southern", "Telangana", "Hyderabad"],
  ["Manjira Vidya", "Pharmacy", "Southern", "Telangana", "Sangareddy"],
  ["Pranhita Prabhat", "Polytechnic", "Western", "Maharashtra", "Chandrapur"],
  ["Wainganga Tejas", "Engineering", "Western", "Maharashtra", "Nagpur"],
  ["Purna Vidyadeep", "Engineering", "Western", "Maharashtra", "Jalna"],
];

const ENG_SUFFIX = ["Institute of Technology", "College of Engineering", "Institute of Engineering & Technology", "Engineering College"];
const SUFFIX: Record<InstitutionType, string[]> = {
  Engineering: ENG_SUFFIX,
  Management: ["School of Management Studies", "Institute of Business Management"],
  Pharmacy: ["College of Pharmacy"],
  Architecture: ["School of Architecture & Planning"],
  Polytechnic: ["Polytechnic"],
  MCA: ["Institute of Computer Applications"],
};
const ROADS = ["NH-44 Bypass Road", "College Road", "Ring Road", "Station Road", "Industrial Area Phase II", "University Road", "Airport Road", "Old Highway", "Lake View Road", "Hill Top Road"];

function initials(s: string) {
  return s
    .replace(/&/g, " ")
    .split(/\s+/)
    .filter((w) => w && !["of", "and"].includes(w.toLowerCase()))
    .map((w) => w[0].toUpperCase())
    .join("");
}

function buildInstitutions(r: Rng): Institution[] {
  return ROWS.map(([prefix, type, region, state, city], idx) => {
    const sfx = SUFFIX[type][idx % SUFFIX[type].length];
    const name = `${prefix} ${sfx}`;
    const id = `1-${int(r, 1, 9)}${String(Math.floor(r() * 1e9)).padStart(9, "0")}`;
    const approvedIntake = type === "Engineering" ? pick(r, [480, 600, 720, 900, 1080]) : pick(r, [60, 120, 180, 240]);
    return {
      id,
      name,
      shortName: initials(name),
      type,
      address: `Plot No. ${int(r, 2, 480)}, ${pick(r, ROADS)}, ${city}, ${state} - ${int(r, 110, 799)}${String(int(r, 1, 999)).padStart(3, "0")}`,
      city,
      state,
      region,
      established: int(r, 1984, 2016),
      approvedIntake,
      enrolment: Math.round(approvedIntake * (type === "Engineering" ? 3.6 : 1.8) * (0.75 + r() * 0.35)),
    };
  });
}

// ---------- officers ----------
const OFFICERS: Officer[] = [
  { id: "RB-1", name: "Dr. Raghavendra Menon", designation: "Director, RB", bureau: "RB" },
  { id: "RB-2", name: "Smt. Kavita Deshpande", designation: "Deputy Director, RB", bureau: "RB" },
  { id: "RB-3", name: "Shri Arvind Rathore", designation: "Assistant Director, RB", bureau: "RB" },
  { id: "RB-4", name: "Ms. Sneha Pillai", designation: "Section Officer, RB", bureau: "RB" },
  { id: "PGRC-1", name: "Dr. Farah Siddiqui", designation: "Director, PGRC", bureau: "PGRC" },
  { id: "PGRC-2", name: "Shri Manoj Kulkarni", designation: "Deputy Director, PGRC", bureau: "PGRC" },
  { id: "PGRC-3", name: "Ms. Priyanka Bose", designation: "Assistant Director, PGRC", bureau: "PGRC" },
  { id: "PGRC-4", name: "Shri Thomas Varghese", designation: "Grievance Officer, PGRC", bureau: "PGRC" },
  { id: "AB-1", name: "Prof. Suresh Iyengar", designation: "Advisor, Approval Bureau", bureau: "AB" },
  { id: "AB-2", name: "Smt. Neha Agarwal", designation: "Deputy Director, AB", bureau: "AB" },
  { id: "AB-3", name: "Shri Vikram Chauhan", designation: "Assistant Director, AB", bureau: "AB" },
  { id: "PAPB-1", name: "Dr. Meenakshi Sundaram", designation: "Director, PAPB", bureau: "PAPB" },
  { id: "PAPB-2", name: "Shri Rohit Saxena", designation: "Assistant Director, PAPB", bureau: "PAPB" },
  { id: "ARC-1", name: "Smt. Lalitha Raman", designation: "Nodal Officer, Anti-Ragging Cell", bureau: "ARC" },
  { id: "ARC-2", name: "Shri Imran Qureshi", designation: "Assistant Director, ARC", bureau: "ARC" },
  { id: "RO-N", name: "Dr. Alok Tripathi", designation: "Regional Officer, Northern (Kanpur)", bureau: "RO", region: "Northern" },
  { id: "RO-S", name: "Dr. Revathi Krishnan", designation: "Regional Officer, Southern (Chennai)", bureau: "RO", region: "Southern" },
  { id: "RO-E", name: "Shri Debashis Mukherjee", designation: "Regional Officer, Eastern (Kolkata)", bureau: "RO", region: "Eastern" },
  { id: "RO-W", name: "Smt. Anjali Patwardhan", designation: "Regional Officer, Western (Mumbai)", bureau: "RO", region: "Western" },
  { id: "RO-C", name: "Shri Mahesh Dubey", designation: "Regional Officer, Central (Bhopal)", bureau: "RO", region: "Central" },
  { id: "RO-NW", name: "Dr. Gurpreet Sandhu", designation: "Regional Officer, North-Western (Chandigarh)", bureau: "RO", region: "North-Western" },
  { id: "RO-SW", name: "Smt. Shobha Hegde", designation: "Regional Officer, South-Western (Bengaluru)", bureau: "RO", region: "South-Western" },
  { id: "RO-NE", name: "Shri Bikash Baruah", designation: "Regional Officer, North-Eastern (Guwahati)", bureau: "RO", region: "North-Eastern" },
  { id: "CA-1", name: "Prof. A. K. Mathur", designation: "Member Secretary (Competent Authority)", bureau: "RO" },
];

// ---------- text ----------
const FIRST = ["Aarav", "Ananya", "Rohan", "Ishita", "Karthik", "Meera", "Siddharth", "Pooja", "Vivek", "Fatima", "Harpreet", "Lakshmi", "Nikhil", "Sana", "Arjun", "Divya", "Rahul", "Keerthana", "Abhishek", "Nandini", "Manish", "Tanvi", "Suresh", "Bhavana", "Imran", "Riya", "Gaurav", "Shreya", "Pranav", "Aditi"];
const LAST = ["Sharma", "Reddy", "Nair", "Iyer", "Das", "Patel", "Singh", "Khan", "Gupta", "Rao", "Mehta", "Joshi", "Banerjee", "Kumar", "Verma", "Naidu", "Chatterjee", "Pillai", "Yadav", "Shetty", "Mishra", "Saikia", "Bhat", "Kaur"];
const COURSES = ["B.Tech CSE", "B.Tech ECE", "B.Tech Mechanical", "B.Tech Civil", "MBA", "B.Pharm", "MCA", "B.Arch", "Diploma in Electrical", "B.Tech AI & DS"];
const DEPTS = ["Computer Science", "Electronics", "Mechanical", "Civil", "Electrical", "Information Technology"];
const SEMS = ["third", "fourth", "fifth", "sixth", "seventh"];

const TEMPLATES: Record<Category, string[]> = {
  "Fee / Refund": [
    "I withdrew my admission from the {course} programme at {inst} within the cancellation window, but the college has not refunded the tuition fee of Rs {amount} and is holding my original certificates until I pay the full course fee.",
    "{inst} collected Rs {amount} as development fee and placement training fee over and above the fee fixed by the state Fee Regulatory Committee. No receipts were issued for the extra amount and students who object are threatened with detention.",
    "My caution deposit of Rs {amount} has not been returned by {inst} even {months} months after I completed the course. The accounts office keeps saying the file is pending with management.",
  ],
  "Faculty Qualification": [
    "Several faculty members in the {dept} department of {inst} do not hold the minimum qualification prescribed by AICTE. Recent graduates are teaching final year subjects while the website lists PhD holders who have never taken classes.",
    "{inst} shows {n} faculty in its mandatory disclosure but only about half are actually employed. Names of teachers who left last year are still displayed to meet the student-faculty ratio.",
    "The {dept} department at {inst} has had no regular professor or head of department for over {months} months. Classes are handled by guest lecturers and labs are run by lab assistants.",
  ],
  Infrastructure: [
    "The laboratories at {inst} are not functional. Equipment listed in the approval documents for the {dept} lab is missing or broken and practicals are being marked without being conducted.",
    "The hostel at {inst} has no drinking water purifier, broken washrooms and frequent power cuts. Rooms meant for two are shared by four students and the mess food has caused repeated illness.",
    "{inst} is running classes from a rented commercial building instead of the campus shown during approval. There is no library, no playground and the computer centre has outdated systems.",
  ],
  "Admission Irregularity": [
    "{inst} has admitted students beyond the approved intake in {course} through management quota without publishing a merit list. Seats were allotted on cash payment of Rs {amount}.",
    "Lateral entry admissions at {inst} were given to candidates who did not appear in state counselling. The admission list was never displayed on the notice board or website.",
    "My son was denied admission at {inst} despite a valid counselling allotment letter. The college demanded a capitation fee of Rs {amount} to confirm the seat.",
  ],
  "Harassment / Ragging": [
    "First-year students in the hostel of {inst} are being ragged by seniors at night. They are forced to stand for hours and threatened if they inform the warden. The anti-ragging squad has not acted.",
    "A faculty member at {inst} has been making inappropriate remarks to female students and threatening to cut internal marks if they complain. The Internal Complaints Committee has not met.",
    "My ward is repeatedly harassed by a group of senior students at {inst}. He has stopped attending classes and the college refused to register a complaint.",
  ],
  "Fake Affiliation Claim": [
    "{inst} is advertising its {course} programme as AICTE approved although it does not appear on the approved list for this academic year. Students were admitted on the strength of this claim.",
    "The brochure of {inst} claims affiliation with a central university and NBA accreditation for all branches. Neither claim is correct and students fear their degrees will not be valid.",
    "{inst} is running an off-campus study centre under its approval letter, which does not permit any off-campus programme. Students at the centre were charged full fees.",
  ],
  "Exam / Result": [
    "The results of the {sem} semester examination at {inst} have been withheld for {months} months without any reason, and students cannot apply for jobs or higher studies.",
    "Internal assessment marks at {inst} were altered after submission and several students were declared failed. Revaluation requests are not being accepted by the examination cell.",
    "{inst} conducted the {sem} semester exams without a published timetable and the question papers were circulated on student groups a day before the exam.",
  ],
  "Placement Misrepresentation": [
    "{inst} advertised 100 percent placement with an average package of Rs {lpa} LPA, but the companies named in the brochure never visited the campus. Students were made to pay Rs {amount} for mandatory placement training.",
    "The placement records displayed by {inst} include students who found jobs through off-campus drives on their own. The college is using these inflated figures in newspaper advertisements.",
    "Students of {inst} were made to sign bonds with a staffing agency as campus placement, and the offer letters were withdrawn after joining fees were collected.",
  ],
};

const SUBJECTS: Record<Category, string[]> = {
  "Fee / Refund": ["Non-refund of fee after admission withdrawal", "Excess fee collection beyond FRC norms", "Caution deposit not returned"],
  "Faculty Qualification": ["Unqualified faculty teaching", "Ghost faculty in mandatory disclosure", "No regular HOD/Professor"],
  Infrastructure: ["Non-functional laboratories", "Poor hostel conditions", "Classes from unapproved premises"],
  "Admission Irregularity": ["Admission beyond approved intake", "Irregular lateral entry admissions", "Capitation fee demanded"],
  "Harassment / Ragging": ["Ragging in hostel", "Harassment by faculty member", "Harassment by seniors"],
  "Fake Affiliation Claim": ["False AICTE approval claim", "False affiliation/accreditation claim", "Unapproved off-campus centre"],
  "Exam / Result": ["Results withheld", "Alteration of internal marks", "Exam conduct irregularities"],
  "Placement Misrepresentation": ["False placement claims", "Inflated placement records", "Fraudulent placement bonds"],
};

function fill(t: string, r: Rng, inst: string, city2?: string) {
  return t
    .replace(/\{inst\}/g, inst)
    .replace(/\{course\}/g, pick(r, COURSES))
    .replace(/\{dept\}/g, pick(r, DEPTS))
    .replace(/\{sem\}/g, pick(r, SEMS))
    .replace(/\{amount\}/g, (int(r, 18, 260) * 1000).toLocaleString("en-IN"))
    .replace(/\{months\}/g, String(int(r, 3, 9)))
    .replace(/\{n\}/g, String(int(r, 60, 140)))
    .replace(/\{lpa\}/g, String(int(r, 6, 12)))
    .replace(/\{city2\}/g, city2 ?? "another city");
}

// Planted cross-bureau overlap scenarios: same issue, worded differently per bureau
interface Scenario {
  category: Category;
  parts: { bureau: BureauCode; subject: string; text: string; type: Case["complainantType"]; channel: Case["channel"] }[];
}
const SCENARIOS: Scenario[] = [
  {
    category: "Fee / Refund",
    parts: [
      { bureau: "RB", type: "Public", channel: "Referred by Ministry", subject: "Retention of original certificates on admission cancellation", text: "Reference received from the Ministry regarding {inst} retaining original certificates of students who sought cancellation of admission and demanding the balance fee for the entire course duration, in violation of the AICTE fee refund policy. Inspection of fee records proposed." },
      { bureau: "PGRC", type: "Student", channel: "AICTE Portal", subject: "College not returning my original certificates", text: "I cancelled my admission at {inst} two weeks after joining but they refuse to return my original 10th and 12th certificates and want the fee for the entire course. I have joined another college and need my certificates urgently." },
    ],
  },
  {
    category: "Faculty Qualification",
    parts: [
      { bureau: "RB", type: "Public", channel: "Email", subject: "Ghost faculty shown to meet norms", text: "Complaint alleging that {inst} has shown ghost faculty on paper to meet AICTE norms. The same faculty names and PAN details appear in the faculty lists of two other institutions in the state." },
      { bureau: "PGRC", type: "Student", channel: "AICTE Portal", subject: "Teachers on website never take classes", text: "Faculty listed on the website of {inst} have never taken any classes. There are only four real teachers for the whole CSE department and the faculty names on the website belong to other colleges." },
    ],
  },
  {
    category: "Admission Irregularity",
    parts: [
      { bureau: "RB", type: "Public", channel: "Referred by Ministry", subject: "Excess admission beyond approved intake", text: "Excess admission beyond approved intake reported in B.Tech CSE at {inst}; about 40 seats over intake filled through management quota without any merit list. Verification against approval letter required." },
      { bureau: "PGRC", type: "Parent", channel: "Email", subject: "Cash taken for management quota seat", text: "{inst} took Rs 4,50,000 in cash from me for a CSE seat in management quota. No merit list was published and now the college says the admission of my daughter is not yet approved for the intake." },
    ],
  },
  {
    category: "Placement Misrepresentation",
    parts: [
      { bureau: "RB", type: "Public", channel: "Email", subject: "Misleading placement advertisement", text: "Misleading advertisement by {inst} claiming 100 percent placement and tie-ups with multinational companies in newspaper advertisements. Requires examination under AICTE norms on misleading advertisements." },
      { bureau: "PGRC", type: "Student", channel: "AICTE Portal", subject: "Promised placement, no companies came", text: "{inst} promised 100 percent placement in its newspaper advertisement but no company has come to campus this year. We each paid Rs 35,000 for placement training and the multinational tie-ups do not exist." },
    ],
  },
  {
    category: "Fake Affiliation Claim",
    parts: [
      { bureau: "RB", type: "Public", channel: "Referred by Ministry", subject: "Unapproved off-campus MBA programme", text: "{inst} reported to be admitting students to an unapproved off-campus MBA programme while displaying AICTE approval on its prospectus. Show-cause action under approval regulations is under consideration." },
      { bureau: "PGRC", type: "Student", channel: "AICTE Portal", subject: "Our MBA course is not approved", text: "We were told our MBA at {inst} is AICTE approved. Now we learn the programme is not approved at this off-campus location and our degree may be invalid. The prospectus clearly shows the AICTE approval logo." },
    ],
  },
  {
    category: "Infrastructure",
    parts: [
      { bureau: "RB", type: "Public", channel: "Email", subject: "Deficiency in labs and built-up area", text: "Regional office inspection noted deficiency in built-up area and laboratories at {inst} compared to Approval Process Handbook norms; the institution appears to operate from rented premises." },
      { bureau: "PGRC", type: "Student", channel: "AICTE Portal", subject: "No working labs, rented building", text: "There are no working labs at {inst}; practical exams are conducted without any equipment. The college runs from a rented commercial building and the labs shown during inspection were borrowed." },
      { bureau: "AB", type: "Faculty", channel: "Email", subject: "Lab equipment borrowed for inspection", text: "As a faculty member of {inst} I report that laboratory equipment was borrowed from another institute only for the AICTE inspection day and returned afterwards. The labs are otherwise empty." },
    ],
  },
  {
    category: "Harassment / Ragging",
    parts: [
      { bureau: "ARC", type: "Student", channel: "Helpline", subject: "Anti-ragging helpline alert", text: "Anti-ragging helpline call reports ragging of first-year hostel students at {inst}; juniors forced to stay awake at night and threatened by seniors. Warden informed but no action taken." },
      { bureau: "PGRC", type: "Parent", channel: "Email", subject: "My son is being ragged in hostel", text: "My son is a first-year student at {inst}. Seniors in the hostel keep him awake all night and threaten him. The warden has done nothing and he wants to leave the college." },
      { bureau: "RB", type: "Public", channel: "Referred by Ministry", subject: "Non-compliance with anti-ragging regulations", text: "Ministry reference on non-compliance of {inst} with anti-ragging regulations: no functional anti-ragging squad and hostel ragging complaints not acted upon by the warden." },
    ],
  },
  {
    category: "Exam / Result",
    parts: [
      { bureau: "PAPB", type: "Public", channel: "Email", subject: "Results withheld for fee dues", text: "Report that {inst} is withholding semester results of students with pending fee dues, contrary to examination guidelines. Clarification sought from the institution." },
      { bureau: "PGRC", type: "Student", channel: "AICTE Portal", subject: "My result is withheld", text: "My fifth semester result at {inst} has been withheld for four months because the college says I have pending fee dues. I cannot apply for internships without my results." },
    ],
  },
  {
    category: "Fee / Refund",
    parts: [
      { bureau: "RB", type: "Public", channel: "Referred by Ministry", subject: "Collection of fee above FRC norms", text: "Representation alleging that {inst} is collecting development fee and other charges above the fee fixed by the Fee Regulatory Committee without receipts. Action under fee regulations to be examined." },
      { bureau: "PGRC", type: "Student", channel: "AICTE Portal", subject: "Extra fee without receipt", text: "{inst} is forcing us to pay Rs 40,000 extra as development fee every year. They don't give any receipt and say it is compulsory. The Fee Regulatory Committee fee is much lower." },
    ],
  },
  {
    category: "Faculty Qualification",
    parts: [
      { bureau: "AB", type: "Faculty", channel: "Email", subject: "HOD without prescribed qualification", text: "The head of department at {inst} does not hold a PhD or the experience prescribed for the post, and was appointed without a selection committee as per AICTE norms." },
      { bureau: "RB", type: "Public", channel: "Email", subject: "Irregular appointment of HOD", text: "Complaint regarding irregular appointment of an unqualified head of department at {inst} without a selection committee, in violation of the AICTE pay and qualification regulations." },
    ],
  },
];

// ---------- timeline ----------
const NOTICE: Record<Category, string> = {
  "Fee / Refund": "Notice issued to institution to furnish fee refund ledger and reasons for non-refund within 15 days.",
  "Faculty Qualification": "Institution directed to submit faculty appointment orders, qualifications and salary statements.",
  Infrastructure: "Institution directed to submit compliance report with photographs of laboratories and built-up area.",
  "Admission Irregularity": "Institution directed to submit admission register and merit list for the academic year.",
  "Harassment / Ragging": "Institution directed to convene anti-ragging committee and submit action-taken report within 7 days.",
  "Fake Affiliation Claim": "Show-cause notice issued for misrepresentation of approval/affiliation status.",
  "Exam / Result": "Institution and affiliating university asked to clarify reasons for the examination issue.",
  "Placement Misrepresentation": "Institution directed to submit placement records with offer letters and company confirmations.",
};
const REPLY: Record<Category, string> = {
  "Fee / Refund": "Institution reply received; claims refund is under process and certificates will be returned on clearance.",
  "Faculty Qualification": "Institution submitted faculty list; qualification documents for several faculty are incomplete.",
  Infrastructure: "Compliance report received with photographs; requires verification by regional office.",
  "Admission Irregularity": "Admission register received; discrepancy noted against approved intake.",
  "Harassment / Ragging": "Action-taken report received; two students suspended from hostel pending inquiry.",
  "Fake Affiliation Claim": "Reply received; institution claims error by advertising agency.",
  "Exam / Result": "University confirms results were withheld at institution level.",
  "Placement Misrepresentation": "Placement records received; offer letters for many listed students not furnished.",
};
const DISPOSAL: Record<Category, string> = {
  "Fee / Refund": "Disposed: institution refunded the amount and returned original certificates; complainant confirmed.",
  "Faculty Qualification": "Disposed: institution directed to replace unqualified faculty; compliance to be verified in next approval cycle.",
  Infrastructure: "Disposed: deficiencies noted for the approval process; institution issued warning.",
  "Admission Irregularity": "Disposed: excess admissions regularised with penalty / cancelled as per regulations.",
  "Harassment / Ragging": "Disposed: anti-ragging committee action confirmed; complainant satisfied.",
  "Fake Affiliation Claim": "Disposed: institution withdrew misleading claims and issued public clarification.",
  "Exam / Result": "Disposed: results declared after intervention.",
  "Placement Misrepresentation": "Disposed: institution directed to withdraw advertisements and refund training fee.",
};

export function nextActionFor(c: Pick<Case, "status" | "actions" | "category">): string {
  if (c.status === "Disposed") return "—";
  if (c.status === "New") return "Assign dealing officer and acknowledge complainant";
  if (c.status === "Transferred") return "Receiving bureau to accept transfer and assign officer";
  if (c.status === "Escalated") return "Competent Authority decision on recommended action";
  const last = [...c.actions].reverse().find((a) => !["Remark", "Linked", "Coordinated"].includes(a.type));
  switch (last?.type) {
    case "Notice Issued":
      return "Await institution reply; send reminder if not received";
    case "Reply Received":
      return "Examine reply and decide on hearing or disposal";
    case "Hearing Scheduled":
      return "Conduct hearing and record proceedings";
    case "Assigned":
      return `Issue notice to institution (${c.category})`;
    default:
      return "Review case and record next step";
  }
}

let actionSeq = 0;
function act(at: number, type: CaseAction["type"], by: string, bureau: CaseAction["bureau"], remarks: string, extra: Partial<CaseAction> = {}): CaseAction {
  actionSeq++;
  return { id: `A${actionSeq}`, at: iso(at), type, by, bureau, remarks, ...extra };
}

function officerOf(bureau: BureauCode, r: Rng) {
  const list = OFFICERS.filter((o) => o.bureau === bureau);
  return list.length > 1 ? list[1 + Math.floor(r() * (list.length - 1))] : list[0];
}
const head = (bureau: BureauCode) => OFFICERS.find((o) => o.bureau === bureau)!;

function buildTimeline(r: Rng, c: Case, receivedMs: number, endMs: number, disposed: boolean) {
  const off = OFFICERS.find((o) => o.id === c.officerId)!;
  const actions: CaseAction[] = [];
  actions.push(act(receivedMs, "Received", "System", "SYSTEM", `Complaint received via ${c.channel}. Institution auto-mapped to ${c.institutionId} (confidence ${Math.round(c.matchConfidence * 100)}%, advisory; ${c.matchReason}).`));
  if (c.status === "New") return actions;
  const span = Math.max(endMs - receivedMs, DAY * 2);
  let t = receivedMs + Math.min(span * 0.08, DAY * int(r, 1, 3));
  actions.push(act(t, "Assigned", head(c.bureau).name, c.bureau, `Assigned to ${off.name} (${off.designation}).`, { to: off.name }));
  const steps: CaseAction["type"][] = ["Notice Issued", "Reply Received", "Hearing Scheduled"];
  const nSteps = disposed ? int(r, 2, 3) : int(r, 0, 3);
  for (let i = 0; i < nSteps; i++) {
    t += (span * (0.75 - 0.08)) / Math.max(nSteps, 1) * (0.6 + r() * 0.5);
    if (t >= endMs - DAY) break;
    const type = steps[i];
    const remarks =
      type === "Notice Issued" ? NOTICE[c.category] : type === "Reply Received" ? REPLY[c.category] : `Personal hearing fixed with institution representatives and complainant.`;
    const docs =
      type === "Notice Issued"
        ? [{ name: `Notice_${c.reference.replace(/\//g, "-")}.pdf`, size: int(r, 80, 240) * 1000 }]
        : type === "Reply Received"
        ? [{ name: `Institution_Reply_${int(r, 100, 999)}.pdf`, size: int(r, 300, 2400) * 1000 }]
        : undefined;
    actions.push(act(t, type, off.name, c.bureau, remarks, { docs }));
  }
  if (!disposed && chance(r, 0.35)) {
    t = Math.min(endMs - DAY * 0.5, t + DAY * int(r, 1, 6));
    if (t > receivedMs) actions.push(act(t, "Remark", off.name, c.bureau, pick(r, ["Reminder sent to institution.", "Complainant contacted for additional documents.", "File put up to Director for orders.", "Regional office requested to verify on site."])));
  }
  if (disposed) {
    actions.push(act(endMs, "Disposed", off.name, c.bureau, DISPOSAL[c.category], { docs: [{ name: `Disposal_Order_${c.id}.pdf`, size: int(r, 90, 300) * 1000 }] }));
  }
  return actions;
}

function variantName(r: Rng, inst: Institution, kind?: "acronym" | "short" | "typo" | "city" | "canonical"): string {
  const k = kind ?? weighted(r, [["acronym", 2], ["short", 2], ["typo", 2], ["city", 2], ["canonical", 1]] as ["acronym" | "short" | "typo" | "city" | "canonical", number][]);
  const prefix = inst.name.split(" ").slice(0, 2).join(" ");
  switch (k) {
    case "acronym":
      return `${inst.shortName}, ${inst.city}`;
    case "short":
      return inst.name
        .replace("Institute", "Inst.")
        .replace("Technology", "Tech.")
        .replace("Engineering", "Engg.")
        .replace("College", "Clg.")
        .replace("Management", "Mgmt.");
    case "typo": {
      const w = prefix.split(" ");
      const a = w[0];
      const i = Math.min(a.length - 2, 2 + Math.floor(r() * 2));
      w[0] = a.slice(0, i) + a[i + 1] + a[i] + a.slice(i + 2);
      return `${w.join(" ")} ${inst.type === "Engineering" ? "Engg College" : inst.type}, ${inst.city}`;
    }
    case "city":
      return `${prefix} College, ${inst.city}`;
    default:
      return inst.name;
  }
}

function mistypePid(r: Rng, pid: string) {
  const chars = pid.split("");
  const i = 2 + Math.floor(r() * 10);
  chars[i] = String((Number(chars[i]) + 1 + Math.floor(r() * 8)) % 10);
  return chars.join("");
}

function refFor(b: BureauCode, r: Rng, year: number) {
  const yy = String(year).slice(2);
  switch (b) {
    case "RB":
      return `RB/F.No.${int(r, 1000, 9999)}/${yy}`;
    case "PGRC":
      return `PGRC/${year}/${String(int(r, 1, 99999)).padStart(5, "0")}`;
    case "AB":
      return `AB/APP/${int(r, 100, 999)}/${yy}`;
    case "PAPB":
      return `PAPB/EX/${int(r, 100, 999)}/${yy}`;
    case "ARC":
      return `ARC/HL/${int(r, 1000, 9999)}`;
  }
}

const SEV_BASE: Record<Category, Severity[]> = {
  "Fee / Refund": ["Medium", "Medium", "High", "Low"],
  "Faculty Qualification": ["Medium", "High", "Medium"],
  Infrastructure: ["Medium", "Low", "High"],
  "Admission Irregularity": ["High", "High", "Medium"],
  "Harassment / Ragging": ["Critical", "High", "Critical"],
  "Fake Affiliation Claim": ["High", "Critical", "High"],
  "Exam / Result": ["Medium", "High", "Medium"],
  "Placement Misrepresentation": ["Medium", "High", "Medium"],
};
const LANGS: [string, number][] = [["English", 70], ["Hindi", 12], ["Telugu", 5], ["Tamil", 5], ["Bengali", 4], ["Marathi", 4]];

export function seedDb(nowMs = Date.now()): Db {
  const r = mulberry32(20260264);
  actionSeq = 0;
  const NOW = Math.floor(nowMs / DAY) * DAY + 6 * 3600000; // ~11:30 IST today
  const institutions = buildInstitutions(r);
  const settings: Settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  const sla = settings.slaDays;
  const drafts: { c: Case; receivedMs: number; endMs: number; disposed: boolean; post?: (c: Case) => void }[] = [];

  const make = (o: {
    inst: Institution;
    category: Category;
    bureau: BureauCode;
    status: Status;
    receivedMs: number;
    endMs?: number;
    subject?: string;
    text?: string;
    reportedName?: string;
    reportedPid?: string | null;
    type?: Case["complainantType"];
    channel?: Case["channel"];
    planted?: string;
    severity?: Severity;
  }) => {
    const reportedName = o.reportedName ?? (chance(r, 0.7) ? o.inst.name : variantName(r, o.inst));
    const reportedPid = o.reportedPid === null ? undefined : o.reportedPid ?? (chance(r, 0.5) ? o.inst.id : undefined);
    const res = resolveInstitution(institutions, reportedName, reportedPid);
    const tIdx = Math.floor(r() * TEMPLATES[o.category].length);
    const description = o.text ? o.text.replace(/\{inst\}/g, reportedName) : fill(TEMPLATES[o.category][tIdx], r, reportedName);
    const type = o.type ?? weighted<Case["complainantType"]>(r, [["Student", 50], ["Parent", 20], ["Faculty", 10], ["Staff", 4], ["Anonymous", 8], ["Public", 8]]);
    const c: Case = {
      id: "",
      reference: refFor(o.bureau, r, new Date(o.receivedMs).getFullYear()),
      dateReceived: iso(o.receivedMs),
      category: o.category,
      status: o.status,
      severity: o.severity ?? pick(r, SEV_BASE[o.category]),
      bureau: o.bureau,
      officerId: officerOf(o.bureau, r).id,
      institutionId: res.institutionId ?? o.inst.id,
      reportedName,
      reportedPid,
      matchConfidence: res.institutionId === o.inst.id ? res.confidence : 0.62,
      matchReason: res.institutionId === o.inst.id ? res.reason : "Mapped manually by dealing officer",
      complainantType: type,
      complainantName: type === "Anonymous" ? "Anonymous" : `${pick(r, FIRST)} ${pick(r, LAST)}`,
      channel: o.channel ?? weighted<Case["channel"]>(r, [["AICTE Portal", 55], ["Email", 20], ["Post", 6], ["CPGRAMS", 12], ["Helpline", 4], ["Referred by Ministry", 3]]),
      language: weighted(r, LANGS),
      subject: o.subject ?? SUBJECTS[o.category][tIdx],
      description,
      lastAction: "",
      lastActionDate: "",
      nextAction: "",
      expectedDisposalDate: addDays(o.receivedMs, sla[o.category]),
      actions: [],
      planted: o.planted,
    };
    const disposed = o.status === "Disposed";
    const d: (typeof drafts)[number] = { c, receivedMs: o.receivedMs, endMs: o.endMs ?? NOW - DAY * r() * 2, disposed };
    drafts.push(d);
    return d;
  };

  // --- background cases ---
  const BG = 285;
  for (let i = 0; i < BG; i++) {
    const inst = institutions[Math.floor(Math.pow(r(), 1.15) * institutions.length)];
    const category = weighted<Category>(r, [
      ["Fee / Refund", 22],
      ["Faculty Qualification", 12],
      ["Infrastructure", 13],
      ["Admission Irregularity", 11],
      ["Harassment / Ragging", 7],
      ["Fake Affiliation Claim", 8],
      ["Exam / Result", 14],
      ["Placement Misrepresentation", 13],
    ]);
    const bureau = ROUTING[category];
    // intake spread evenly over 18 months, slightly rising towards today
    const age = 540 * Math.pow(r(), 1.12) + 0.5;
    const receivedMs = NOW - age * DAY;
    const took = sla[category] * (0.35 + r() * (chance(r, 0.2) ? 1.3 : 0.6));
    const mustClose = age > sla[category] * 0.88 || took < age * 0.9 && chance(r, 0.55);
    if (!mustClose) {
      const status = weighted<Status>(r, [["New", age < 6 ? 6 : 1], ["Under Process", 10], ["Transferred", 0.4], ["Escalated", 0.6]]);
      make({ inst, category, bureau, status, receivedMs });
    } else {
      const t = Math.min(took, age - 0.3);
      make({ inst, category, bureau, status: "Disposed", receivedMs, endMs: receivedMs + t * DAY });
    }
  }

  // --- planted overlap clusters (15) ---
  const usedInst = new Set<string>();
  const clusterInst = [3, 9, 1, 13, 15, 20, 5, 30, 24, 45, 55, 33, 41, 50, 58];
  for (let k = 0; k < 15; k++) {
    const inst = institutions[clusterInst[k]];
    usedInst.add(inst.id);
    const sc = SCENARIOS[k % SCENARIOS.length];
    const parts = k >= 10 ? sc.parts.slice(0, 2) : sc.parts;
    const base = NOW - int(r, 8, Math.max(12, Math.floor(sla[sc.category] * 0.8))) * DAY;
    parts.forEach((p, j) => {
      const official = p.bureau === "RB" || p.channel === "Referred by Ministry";
      const reportedName = official ? inst.name : variantName(r, inst, pick(r, ["acronym", "typo", "short", "city"] as const));
      const reportedPid = official ? (k % 4 === 3 ? mistypePid(r, inst.id) : inst.id) : null;
      make({
        inst,
        category: sc.category,
        bureau: p.bureau,
        status: j === 0 ? "Under Process" : pick(r, ["New", "Under Process"] as Status[]),
        receivedMs: base + j * int(r, 1, 4) * DAY + int(r, 1, 20) * 3600000,
        subject: p.subject,
        text: p.text,
        reportedName,
        reportedPid,
        type: p.type,
        channel: p.channel,
        planted: `overlap-${k + 1}`,
      });
    });
  }

  // --- planted SLA breaches (10) ---
  const slaCats: Category[] = ["Fee / Refund", "Harassment / Ragging", "Exam / Result", "Admission Irregularity", "Fee / Refund", "Placement Misrepresentation", "Infrastructure", "Faculty Qualification", "Exam / Result", "Harassment / Ragging"];
  slaCats.forEach((category, i) => {
    const inst = institutions[(i * 7 + 2) % institutions.length];
    const over = int(r, 4, 48);
    make({
      inst,
      category,
      bureau: ROUTING[category],
      status: i % 3 === 0 ? "Under Process" : i % 3 === 1 ? "Under Process" : "New",
      receivedMs: NOW - (sla[category] + over) * DAY,
      planted: "sla",
      severity: category === "Harassment / Ragging" ? "Critical" : "High",
    });
  });

  // --- transfer / escalation chains (5) ---
  const chains: { from: BureauCode; to: BureauCode; category: Category; final: Status; why: string }[] = [
    { from: "PGRC", to: "RB", category: "Fee / Refund", final: "Under Process", why: "Systemic violation of refund policy affecting multiple students; regulatory action needed." },
    { from: "AB", to: "RB", category: "Faculty Qualification", final: "Escalated", why: "Prima facie misrepresentation in approval documents; falls under Regulation Bureau." },
    { from: "PGRC", to: "ARC", category: "Harassment / Ragging", final: "Escalated", why: "Ragging allegation; mandatory handling by Anti-Ragging Cell." },
    { from: "PAPB", to: "PGRC", category: "Exam / Result", final: "Transferred", why: "Individual grievance on result withholding; better handled by PGRC." },
    { from: "AB", to: "RB", category: "Fake Affiliation Claim", final: "Transferred", why: "Unapproved off-campus centre is a regulatory violation." },
  ];
  chains.forEach((ch, i) => {
    const inst = institutions[(i * 11 + 6) % institutions.length];
    const receivedMs = NOW - int(r, 10, Math.max(12, sla[ch.category] - 2)) * DAY;
    const d = make({ inst, category: ch.category, bureau: ch.from, status: "Under Process", receivedMs, planted: "chain" });
    d.post = (c) => {
      const t0 = new Date(c.actions[c.actions.length - 1].at).getTime();
      const t1 = Math.min(NOW - DAY * 2, t0 + DAY * int(r, 1, 3));
      const fromOff = OFFICERS.find((o) => o.id === c.officerId)!;
      c.actions.push(act(t1, "Transferred", fromOff.name, ch.from, `Transferred to ${ch.to}: ${ch.why}`, { from: ch.from, to: ch.to }));
      c.bureau = ch.to;
      c.reference = `${refFor(ch.to, r, new Date(receivedMs).getFullYear())} (earlier ${c.reference})`;
      const newOff = officerOf(ch.to, r);
      c.officerId = newOff.id;
      if (ch.final !== "Transferred") {
        const t2 = Math.min(NOW - DAY, t1 + DAY * int(r, 1, 2));
        c.actions.push(act(t2, "Assigned", head(ch.to).name, ch.to, `Transfer accepted. Assigned to ${newOff.name}.`, { to: newOff.name }));
        if (ch.final === "Escalated") {
          const t3 = Math.min(NOW - 3600000 * 5, t2 + DAY * int(r, 1, 2));
          c.actions.push(act(t3, "Escalated", newOff.name, ch.to, "Escalated to Competent Authority: institution non-responsive to notices; recommend inspection and show-cause.", { from: ch.to, to: "Competent Authority" }));
        }
      }
      c.status = ch.final;
    };
  });

  // --- suspicious bursts (2) ---
  const burstDefs: { idx: number; category: Category; text: string }[] = [
    { idx: 17, category: "Placement Misrepresentation", text: "{inst} is cheating students with fake placement promises. Complete fraud college, take strict action and cancel approval immediately." },
    { idx: 36, category: "Fee / Refund", text: "{inst} is looting students with high fees. Cancel the AICTE approval of this college immediately, it is a fraud institution." },
  ];
  burstDefs.forEach((b, bi) => {
    const inst = institutions[b.idx];
    const start = NOW - (bi === 0 ? 9 : 4) * DAY;
    for (let j = 0; j < 6; j++) {
      make({
        inst,
        category: b.category,
        bureau: "PGRC",
        status: "New",
        receivedMs: start + j * int(r, 2, 6) * 3600000,
        text: b.text,
        subject: "Fraud college — cancel approval",
        reportedName: j % 2 ? inst.name : variantName(r, inst, "city"),
        reportedPid: null,
        type: "Anonymous",
        channel: "AICTE Portal",
        planted: `burst-${bi + 1}`,
        severity: "Medium",
      });
    }
  });

  // --- finalize ---
  drafts.sort((a, b) => a.receivedMs - b.receivedMs);
  const seq: Record<number, number> = {};
  for (const d of drafts) {
    const y = new Date(d.receivedMs).getFullYear();
    seq[y] = (seq[y] ?? 0) + 1;
    d.c.id = `NS-${y}-${String(seq[y]).padStart(5, "0")}`;
  }
  const cases = drafts.map((d) => {
    const c = d.c;
    c.actions = buildTimeline(r, c, d.receivedMs, Math.min(d.endMs, NOW - 3600000), d.disposed);
    d.post?.(c);
    if (d.disposed) c.disposedAt = c.actions[c.actions.length - 1].at;
    const last = c.actions[c.actions.length - 1];
    c.lastAction = `${last.type}: ${last.remarks}`;
    c.lastActionDate = last.at;
    c.nextAction = nextActionFor(c);
    return c;
  });

  return {
    version: 1,
    seededAt: iso(NOW),
    institutions,
    officers: OFFICERS,
    cases,
    linkGroups: [],
    dismissedPairs: [],
    alertReads: {},
    audit: [
      {
        id: "AU1",
        at: iso(NOW - DAY * 540),
        role: "system",
        actor: "System",
        action: "SEED",
        target: "database",
        detail: `Synthetic demo dataset generated: ${institutions.length} institutions, ${cases.length} cases.`,
      },
    ],
    settings,
    counters: { case: 0, action: actionSeq, audit: 1, group: 0 },
    ...seedStudentLayer(institutions, settings, NOW),
  };
}

// ---------- student layer (own RNG, so the data above stays identical) ----------
const SILENT_COLLEGES = [21, 39, 51];
// colleges with enough student complaints for a confident handling score
const FOCUS_COLLEGES = [DEMO_COLLEGE_INDEX, 5, 9, 13, 24, 30, 33, 41, 45, 55, 3, 15, 26, 1, 47, 28];
const NODAL_FIRST = ["Dr. Ashok", "Prof. Sunita", "Dr. Venkat", "Prof. Rekha", "Dr. Joseph", "Prof. Anil", "Dr. Parveen", "Prof. Geeta"];
const NODAL_LAST = ["Bhargava", "Kulkarni", "Natarajan", "Sen", "Thomas", "Tiwari", "Ansari", "Hazarika"];

function seedStudentLayer(institutions: Institution[], settings: Settings, NOW: number) {
  const r = mulberry32(20260265);
  const iso2 = (t: number) => iso(Math.min(t, NOW));
  const signals: InstitutionSignals[] = institutions.map((inst, idx) => {
    const feeNorm = int(r, 60, 140) * 1000;
    return {
      institutionId: inst.id,
      nodalOfficer: `${pick(r, NODAL_FIRST)} ${pick(r, NODAL_LAST)}`,
      actualIntake: Math.round(inst.approvedIntake * (chance(r, 0.25) ? 1 + r() * 0.22 : 0.82 + r() * 0.18)),
      feeNorm,
      feeCharged: Math.round(feeNorm * (chance(r, 0.3) ? 1 + r() * 0.45 : 0.9 + r() * 0.1)),
      complianceValidUntil: iso(NOW + int(r, -120, 540) * DAY),
      profile: SILENT_COLLEGES.includes(idx) ? "silent" : undefined,
    };
  });

  const students: StudentAccount[] = DEMO_STUDENTS.map((d, i) => {
    const id = `STU-D${i + 1}`;
    return { id, apaarId: d.apaarId, mobile: d.mobile, name: d.name, rollNo: d.rollNo, institutionId: institutions[d.collegeIndex].id, pseudonym: pseudonymFor(id), pulseTermsDone: [], pulseInvited: true, demo: true };
  });
  const newStudent = (inst: Institution): StudentAccount => {
    const n = students.length + 1;
    const id = `STU-${String(n).padStart(4, "0")}`;
    const s: StudentAccount = {
      id,
      apaarId: `APAAR-${int(r, 100000, 999999)}${n}`,
      mobile: `9${int(r, 100000000, 999999999)}`,
      name: `${pick(r, FIRST)} ${pick(r, LAST)}`,
      rollNo: `${inst.shortName}${int(r, 20, 26)}${String(int(r, 1, 999)).padStart(3, "0")}`,
      institutionId: inst.id,
      pseudonym: pseudonymFor(id),
      pulseTermsDone: [],
      pulseInvited: chance(r, 0.08),
    };
    students.push(s);
    return s;
  };

  const quality = new Map(institutions.map((i) => [i.id, r()]));
  const pool = institutions.filter((_, i) => !SILENT_COLLEGES.includes(i));
  const focus = FOCUS_COLLEGES.map((i) => institutions[i]);
  const complaints: StudentComplaint[] = [];
  const samples = VOICE_SAMPLES.filter((s) => s.code !== "en-IN");
  for (let n = 0; n < 120; n++) {
    const inst = n < 8 ? focus[0] : chance(r, 0.68) ? pick(r, focus) : pick(r, pool);
    const student = n < 4 ? students[n % 2] : newStudent(inst);
    const sample = n % 8 === 3 ? samples[n % samples.length] : undefined;
    const category = sample ? sample.category : weighted<Category>(r, [["Fee / Refund", 24], ["Faculty Qualification", 10], ["Infrastructure", 22], ["Admission Irregularity", 6], ["Harassment / Ragging", 8], ["Fake Affiliation Claim", 5], ["Exam / Result", 18], ["Placement Misrepresentation", 7]]);
    const tIdx = Math.floor(r() * TEMPLATES[category].length);
    const english = sample ? sample.translation : fill(TEMPLATES[category][tIdx], r, inst.name);
    const sev = severityOf(english, category);
    const sla = settings.slaDays[category];
    const q = quality.get(inst.id)!;
    // better-run colleges close more complaints with student confirmation
    const status: StudentStatus =
      n < 4
        ? (["With College", "With College", "Resolved - Pending Verification", "Closed - Verified"] as StudentStatus[])[n]
        : weighted<StudentStatus>(r, [
            ["With College", 34],
            ["Resolved - Pending Verification", 12],
            ["Closed - Verified", 16 + q * 48],
            ["Closed - Unverified", 4 + (1 - q) * 14],
            ["Escalated to AICTE", 2 + (1 - q) * 14],
          ]);
    const open = status === "With College";
    const pending = status === "Resolved - Pending Verification";
    const overdueAtCollege = open && n >= 4 && chance(r, 0.12);
    const age = open ? (overdueAtCollege ? sla + 1 : int(r, 1, Math.max(2, sla - 1))) : pending ? int(r, 6, 30) : int(r, 12, 320);
    const createdMs = NOW - age * DAY - int(r, 1, 20) * 3600000;
    const dueMs = createdMs + sla * DAY;
    const c: StudentComplaint = {
      id: `SC-${new Date(createdMs).getFullYear()}-${String(n + 1).padStart(5, "0")}`,
      studentId: student.id,
      pseudonym: student.pseudonym,
      institutionId: inst.id,
      category,
      subject: sample ? sample.subject : SUBJECTS[category][tIdx],
      channel: sample ? "Voice" : chance(r, 0.12) ? "Photo" : "Text",
      language: sample ? sample.language : "English",
      originalText: sample ? sample.original : english,
      translatedText: english,
      translationSource: sample ? "sample" : "original",
      severity: sev.severity,
      severityReason: sev.reason,
      categoryReason: categoryOf(english).reason,
      routedBureau: ROUTING[category],
      status,
      createdAt: iso2(createdMs),
      dueAt: iso(dueMs),
      escalationLevel: overdueAtCollege ? 1 : 0,
      reminders: [],
      actions: [{ at: iso2(createdMs), type: "Submitted", by: student.pseudonym, remarks: `Complaint submitted through the student portal (${sample ? "voice" : "text"}).` }],
      suspicious: [],
    };
    const nodal = signals.find((x) => x.institutionId === c.institutionId)!.nodalOfficer;
    if (open) {
      const at = iso2(NOW - int(r, 0, 2) * DAY - 3600000);
      const message = overdueAtCollege ? "Disposal date passed; escalated to the Principal." : `Action pending. Disposal due ${new Date(dueMs).toISOString().slice(0, 10)}.`;
      c.reminders.push({ at, channel: "In-app", to: nodal, message }, { at, channel: "SMS (simulated)", to: nodal, message });
      c.lastReminderAt = at;
      if (overdueAtCollege) c.actions.push({ at: iso2(dueMs + 3600000), type: "Auto-escalated", by: "System", remarks: "Disposal date passed. Escalated to the Principal." });
    } else {
      const resolvedMs = pending ? NOW - int(r, 1, 5) * DAY : createdMs + Math.min(age - 1, int(r, 3, sla + 8)) * DAY;
      const note = `Action taken on the complaint and ${category.toLowerCase()} records updated by the college. Photographs and the order are attached.`;
      const docs = [{ name: `Proof_${c.id}.pdf`, size: int(r, 90, 900) * 1000 }];
      c.proof = { note, docs, at: iso2(resolvedMs), by: nodal };
      c.evidence = mockEvidence({ category, note, docs, at: iso2(resolvedMs) });
      c.verifyBy = iso(resolvedMs + settings.verifyWindowDays * DAY);
      c.actions.push({ at: iso2(resolvedMs), type: "Proof uploaded", by: nodal, remarks: `Marked resolved, pending student verification. ${note}` });
      const decided = Math.min(NOW - 3600000, resolvedMs + int(r, 1, 6) * DAY);
      if (status === "Closed - Verified") {
        c.closedAt = iso2(decided);
        c.actions.push({ at: iso2(decided), type: "Student confirmed: Done", by: student.pseudonym, remarks: "Closed as verified by the student." });
      } else if (status === "Closed - Unverified") {
        c.closedAt = iso2(resolvedMs + settings.verifyWindowDays * DAY);
        c.actions.push({ at: c.closedAt, type: "Closed - Unverified", by: "System", remarks: `No student response in ${settings.verifyWindowDays} days. Counts less than a verified closure.` });
      } else if (status === "Escalated to AICTE") {
        c.escalationLevel = 2;
        c.reopened = true;
        c.actions.push({ at: iso2(decided), type: "Student responded: Not done", by: student.pseudonym, remarks: `Reopened and escalated to ${ROUTING[category]} at AICTE, not returned to the college.` });
      }
    }
    complaints.push(c);
  }
  complaints.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const flagged = complaints.filter((c) => c.status === "With College").slice(0, 3);
  flagged.forEach((c) => c.suspicious.push("Near-duplicate wording across accounts (advisory): verify genuineness"));

  // pulse survey totals for ~40 colleges, including low-response totals for the silent ones
  const pulse: PulseAggregate[] = [];
  const ranked = [...focus, ...pool.filter((i) => !focus.includes(i))].slice(0, 37);
  for (const inst of [...ranked, ...SILENT_COLLEGES.map((i) => institutions[i])]) {
    const silent = SILENT_COLLEGES.includes(institutions.indexOf(inst));
    const invited = Math.round(inst.enrolment * (0.05 + r() * 0.05));
    const responded = silent ? Math.max(2, Math.round(invited * 0.04)) : Math.round(invited * (0.28 + r() * 0.45));
    const q = quality.get(inst.id)!;
    const mean = () => 2.2 + q * 1.9 + (r() - 0.5) * 0.7;
    pulse.push({
      institutionId: inst.id,
      term: PULSE_TERM,
      invited,
      responded,
      sums: { infrastructure: Math.round(mean() * responded), faculty: Math.round(mean() * responded), fees: Math.round(mean() * responded), safety: Math.round(mean() * responded) },
      unable: Math.round(responded * (silent ? 0.55 : (1 - q) * 0.3 + r() * 0.06)),
    });
  }

  return { students, studentComplaints: complaints, studentSessions: [], otpRequests: [], pulse, signals };
}

export { OFFICERS, TEMPLATES, SUBJECTS, SCENARIOS, variantName, fill };
export const CATEGORY_LIST = CATEGORIES;
