import axios from 'axios';

const TEST_URL = 'http://localhost:5001/test';
const STATS_URL = 'http://localhost:5001/api/system-logs/latest';

const checkRoute = async (url, name) => {
    try {
        console.log(`Checking ${name}: ${url}`);
        const response = await axios.get(url);
        console.log(`✅ ${name} Status: ${response.status}`);
        console.log(`✅ ${name} Data:`, typeof response.data === 'object' ? JSON.stringify(response.data).substring(0, 100) + '...' : response.data);
        return true;
    } catch (error) {
        console.error(`❌ ${name} Failed:`, error.message);
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Data:`, error.response.data);
        }
        return false;
    }
};

const run = async () => {
    await checkRoute(TEST_URL, "Debug Route");
    await checkRoute(STATS_URL, "Stats Route");
};

run();
