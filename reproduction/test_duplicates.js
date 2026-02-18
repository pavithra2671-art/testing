import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

const superAdminCreds = {
    email: "foxdigital01@gmail.com",
    password: "foxsuperadmin01"
};

async function testDuplicates() {
    try {
        console.log("1. Logging in...");
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: superAdminCreds.email,
            password: superAdminCreds.password,
            role: "Super Admin"
        });
        const token = loginRes.data.token;

        const taskData = {
            projectName: "Duplicate Test Project",
            taskTitle: "Identical Task Title",
            description: "Testing duplicates",
            workCategory: "Dev",
            priority: "Low",
            startDate: new Date().toISOString(),
            deadline: new Date(Date.now() + 86400000).toISOString(),
            assignType: "Single",
            assignee: loginRes.data.user._id, // Assign to self
            department: ["IT"]
        };

        console.log("2. Creating Task #1...");
        await axios.post(`${API_URL}/tasks`, taskData, {
            headers: { 'x-auth-token': token }
        });
        console.log("   ✅ Task #1 Created");

        console.log("3. Creating Task #2 (Identical)...");
        await axios.post(`${API_URL}/tasks`, taskData, {
            headers: { 'x-auth-token': token }
        });
        console.log("   ✅ Task #2 Created (Success - Duplicate allowed)");

    } catch (error) {
        if (error.response && error.response.status === 400) {
            console.log("   ❌ Task #2 Failed: 400 Bad Request (Duplicate blocked)");
        } else {
            console.error("   ❌ Error:", error.message);
            if (error.response) console.error(error.response.data);
        }
    }
}

testDuplicates();
