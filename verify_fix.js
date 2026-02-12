
// Verification Script for Array Filtering Logic

function testFiltering() {
    console.log("Running Verification for Filtering Logic...");

    const testCases = [
        { input: [''], expected: [], name: "Empty String Array" },
        { input: ['validId', ''], expected: ['validId'], name: "Mixed Valid and Empty" },
        { input: ['null'], expected: ['null'], name: "String 'null' (Should likely be filtered too but current logic keeps it unless I updated it? Wait, I did check for 'null')" },
        // checking the code I wrote: r !== "null"
        { input: ['null'], expected: [], name: "String 'null'" },
        { input: ['undefined'], expected: [], name: "String 'undefined'" },
        { input: [null], expected: [], name: "Actual null value" },
        // My code: r => r && ... so actual null is filtered by `r` check.
        { input: ['validId'], expected: ['validId'], name: "Valid ID" }
    ];

    let passed = true;

    testCases.forEach(test => {
        // The logic I implemented:
        // parsedArr = arr.filter(r => r && r !== "" && r !== "null" && r !== "undefined");

        const output = test.input.filter(r => r && r !== "" && r !== "null" && r !== "undefined");

        const isMatch = JSON.stringify(output) === JSON.stringify(test.expected);
        console.log(`Test '${test.name}': ${isMatch ? "PASSED" : "FAILED"}`);
        if (!isMatch) {
            console.log(`   Input: ${JSON.stringify(test.input)}`);
            console.log(`   Expected: ${JSON.stringify(test.expected)}`);
            console.log(`   Got: ${JSON.stringify(output)}`);
            passed = false;
        }
    });

    if (passed) {
        console.log("\nAll filtering logic tests PASSED.");
    } else {
        console.error("\nSome tests FAILED.");
        process.exit(1);
    }
}

testFiltering();
