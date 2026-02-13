
import { saveChapterData, getChapterData, checkFirebaseConnection } from './firebase';

const verify = async () => {
    console.log("Checking connection...");
    // Mock navigator.onLine since it might not exist in node environment
    // @ts-ignore
    if (typeof navigator === 'undefined') global.navigator = { onLine: true };

    const key = "test_chapter_topic_notes_v1";
    const testData = {
        title: "Test Chapter",
        topicNotes: [
            {
                id: "123",
                title: "My Note 1",
                topic: "Intro",
                content: "<h1>Hello</h1>",
                isPremium: false
            },
            {
                id: "456",
                title: "My Note 2",
                topic: "Advanced",
                content: "<p>World</p>",
                isPremium: true
            }
        ]
    };

    console.log("Saving test data...");
    await saveChapterData(key, testData);
    console.log("Save complete.");

    console.log("Reading test data...");
    const readData = await getChapterData(key);
    console.log("Read Data:", JSON.stringify(readData, null, 2));

    if (readData && readData.topicNotes && readData.topicNotes.length === 2) {
        console.log("SUCCESS: Topic Notes preserved.");
    } else {
        console.error("FAILURE: Topic Notes missing or malformed.");
    }
};

verify().catch(console.error);
