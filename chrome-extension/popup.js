document.getElementById('scrapeBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('status');
  statusEl.innerText = "Extracting posts from screen...";
  document.getElementById('scrapeBtn').disabled = true;

  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url.includes("linkedin.com")) {
      statusEl.innerText = "❌ Please open LinkedIn first.";
      document.getElementById('scrapeBtn').disabled = false;
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: "EXTRACT_POSTS" }, async (response) => {
      if (chrome.runtime.lastError) {
        statusEl.innerText = "❌ Please refresh the LinkedIn page and try again.";
        document.getElementById('scrapeBtn').disabled = false;
        return;
      }

      if (response && response.posts && response.posts.length > 0) {
        statusEl.innerText = `Found ${response.posts.length} posts. Sending to AI backend...`;
        
        try {
          const res = await fetch("http://localhost:8000/api/extension/save-posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ posts: response.posts })
          });
          const data = await res.json();
          statusEl.innerText = `✅ Success! ${data.message}`;
        } catch (err) {
          statusEl.innerText = `❌ Failed to connect to localhost:8000. Is FastAPI running?`;
        }
      } else {
        statusEl.innerText = "⚠️ No posts found on this page. Are you on the 'Posts' activity feed?";
      }
      document.getElementById('scrapeBtn').disabled = false;
    });
  } catch (err) {
    statusEl.innerText = "❌ Error occurred.";
    document.getElementById('scrapeBtn').disabled = false;
  }
});
