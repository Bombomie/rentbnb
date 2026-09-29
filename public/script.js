import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase.js"; // Make sure the path to your firebase config is correct!

async function downloadCollectionAsJSON(collectionName) {
  try {
    console.log(`Fetching ${collectionName}...`);
    const querySnapshot = await getDocs(collection(db, collectionName));
    
    const dataArray = querySnapshot.docs.map(doc => {
      return { id: doc.id, ...doc.data() };
    });

    const jsonStr = JSON.stringify(dataArray, null, 2);

    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${collectionName}.json`;
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("Download complete!");
  } catch (error) {
    console.error("Error downloading JSON:", error);
  }
}

// RUN IT AUTOMATICALLY WHEN THE PAGE LOADS:
downloadCollectionAsJSON("users");