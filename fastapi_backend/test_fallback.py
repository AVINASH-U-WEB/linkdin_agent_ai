import os

local_dir = os.path.join(os.getcwd(), "weekly_calendar")
print(f"local_dir: {local_dir}")
print(f"Exists: {os.path.exists(local_dir)}")

posts = []
for file_name in sorted(os.listdir(local_dir)):
    if file_name.endswith(".txt"):
        with open(os.path.join(local_dir, file_name), "r", encoding="utf-8") as f:
            lines = f.readlines()
        print(f"{file_name}: length = {len(lines)}")
        if len(lines) >= 4:
            topic = lines[1].replace("TOPIC:", "").strip()
            score = lines[2].replace("SCORE:", "").strip()
            draft = "".join(lines[4:])
            posts.append({"topic": topic, "score": score})

print(f"Loaded posts: {len(posts)}")
