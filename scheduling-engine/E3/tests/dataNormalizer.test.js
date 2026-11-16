
const assert = require("node:assert/strict");

const {
    normalizeData,
    validateNormalizedData,
    LAB_DURATION_BY_CREDIT
} = require("../data/dataNormalizer");

// Test 1: Lab duration mapping
assert.equal(LAB_DURATION_BY_CREDIT[1], 1);
assert.equal(LAB_DURATION_BY_CREDIT[1.5], 2);
assert.equal(LAB_DURATION_BY_CREDIT[2], 4);

// Test 2: Excel-style input
const excelData = {
    Course: [
        {
            course_id: "C101",
            course_name: "Machine Learning",
            course_type: "Theory",
            credits: 3
        },
        {
            course_id: "C102",
            course_name: "Machine Learning Lab",
            course_type: "Lab",
            credits: 1.5
        }
    ],
    Faculty: [
        {
            faculty_id: "F101",
            faculty_name: "Faculty One"
        }
    ],
    Division: [
        {
            division_id: "D1",
            division_name: "A"
        }
    ],
    Room: [
        {
            room_id: "R1",
            room_name: "LAB1",
            room_type: "Lab"
        }
    ],
    Course_Faculty: [],
    Course_Division: []
};

const normalizedExcel = normalizeData(excelData);

assert.equal(normalizedExcel.courses.length, 2);
assert.equal(normalizedExcel.courses[1].durationHours, 2);
assert.equal(normalizedExcel.faculty[0].facultyId, "F101");

// Test 3: Supabase-style input
const supabaseData = {
    courses: [
        {
            courseId: "C201",
            courseName: "Computer Networks Lab",
            courseType: "LAB",
            credits: 2
        }
    ],
    faculty: [],
    divisions: [],
    rooms: [],
    courseFaculty: [],
    courseDivision: []
};

const normalizedSupabase = normalizeData(supabaseData);

assert.equal(
    normalizedSupabase.courses[0].durationHours,
    4
);

// Test 4: Invalid lab credits
const invalidData = normalizeData({
    courses: [
        {
            course_id: "C999",
            course_name: "Unknown Lab",
            course_type: "LAB",
            credits: 3
        }
    ]
});

const validation = validateNormalizedData(invalidData);

assert.equal(validation.valid, false);
assert.ok(
    validation.errors.some(error =>
        error.includes("unsupported credit value")
    )
);

console.log("PASS: Lab duration mapping");
console.log("PASS: Excel data normalization");
console.log("PASS: Supabase data normalization");
console.log("PASS: Invalid lab duration detection");

console.log("All data normalizer tests passed!");
