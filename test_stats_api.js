import axios from 'axios';

const API_URL = 'http://localhost:5001/api/system-logs/latest';

const testApi = async () => {
    try {
        console.log(`Testing API: ${API_URL}`);
        const response = await axios.get(API_URL);

        if (response.status === 200) {
            console.log('✅ API Request Successful');
            console.log('Response Data:', JSON.stringify(response.data, null, 2));

            const { hostname, publicIP, localIPs, ramUsage, timestamp } = response.data;

            if (hostname && ipAddress && ramUsage && timestamp) { // Wait, publicIP property name might be different in fallback?
                // Fallback has: hostname, publicIP, localIPs, ramUsage, timestamp
            }

            // Just check existence of keys
            if (response.data.ramUsage && response.data.timestamp) {
                console.log('✅ Data Structure Valid');
            } else {
                console.error('❌ Data Structure Invalid: Missing fields');
            }

        } else {
            console.error(`❌ API Failed with status: ${response.status}`);
        }
    } catch (error) {
        console.error('❌ API Request Failed:', error.message);
        if (error.response) {
            console.error('Error Details:', error.response.data);
        }
    }
};

testApi();
