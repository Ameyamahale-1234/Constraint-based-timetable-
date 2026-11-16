
const fs = require("fs");
const path = require("path");

const testDirectory = __dirname;

// Automatically discover all test files.
const testFiles = fs.readdirSync(testDirectory)
    .filter(file =>
        file.endsWith(".test.js") &&
        file !== "runAllTests.js"
    )
    .sort();

let passed = 0;
let failed = 0;

const failedTests = [];

console.log("\n===== CLASSSYNC E3 TEST REPORT =====\n");

for (const file of testFiles) {
    try {
        require(path.join(testDirectory, file));

        passed++;
        console.log(`PASS: ${file}`);
    } catch (error) {
        failed++;
        failedTests.push({
            file,
            error: error.message
        });

        console.log(`FAIL: ${file}`);
        console.log("Reason:", error.message);
    }
}

console.log("\n===== FINAL SUMMARY =====");
console.log("Total tests:", testFiles.length);
console.log("Passed:", passed);
console.log("Failed:", failed);

if (failedTests.length > 0) {
    console.log("\n===== FAILED TEST DETAILS =====");

    for (const test of failedTests) {
        console.log(`\n${test.file}`);
        console.log(test.error);
    }

    process.exitCode = 1;
} else {
    console.log("\nAll ClassSync E3 tests passed!");
}
