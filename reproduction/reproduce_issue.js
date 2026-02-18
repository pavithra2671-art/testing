
const API_URL = 'http://localhost:5000/api';
const USER_ID = '65d4a1b2c3d4e5f6a7b8c9d0'; // Dummy ObjectId

async function run() {
    try {
        console.log("Creating test task...");
        const taskRes = await fetch(`${API_URL}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectName: "Repro Project",
                taskTitle: "Repro Task " + Date.now(),
                description: "Test Description",
                assignType: "Single",
                assignee: USER_ID,
                priority: "Medium",
                deadline: "2025-12-31",
                roles: ["Developer"]
            })
        });

        if (!taskRes.ok) {
            console.error("Failed to create task:", await taskRes.text());
            return;
        }

        const taskData = await taskRes.json();
        const taskId = taskData.task._id;
        console.log(`Task created: ${taskId}`);

        console.log("Sending concurrent requests to accept task...");

        const payload = JSON.stringify({ userId: USER_ID, status: "Accepted" });
        const headers = { 'Content-Type': 'application/json' };

        const req1 = fetch(`${API_URL}/tasks/${taskId}/respond`, { method: 'POST', headers, body: payload });
        const req2 = fetch(`${API_URL}/tasks/${taskId}/respond`, { method: 'POST', headers, body: payload });
        const req3 = fetch(`${API_URL}/tasks/${taskId}/respond`, { method: 'POST', headers, body: payload }); // Try 3 just in case

        await Promise.all([req1, req2, req3]);

        console.log("Checking task sessions...");
        // Wait a small bit for DB writes to settle if needed, though await above should handle response
        await new Promise(r => setTimeout(r, 1000));

        const checkRes = await fetch(`${API_URL}/tasks/${taskId}`);
        const checkData = await checkRes.json();

        console.log(`Sessions count: ${checkData.sessions.length}`);
        if (checkData.sessions.length > 1) {
            console.log("ISSUE REPRODUCED: Multiple sessions found!");
            checkData.sessions.forEach((s, i) => console.log(`Session ${i}: ${s.startTime}`));
        } else {
            console.log("Issue NOT reproduced (only 1 session).");
        }
    } catch (err) {
        console.error("Error:", err);
    }
}

run();
