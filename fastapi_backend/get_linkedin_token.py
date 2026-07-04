import os
import webbrowser
import urllib.request
import urllib.parse
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

# ==============================================================================
# INSTRUCTIONS:
# 1. Go to your LinkedIn Developer Portal -> Auth tab.
# 2. Copy your "Client ID" and "Client Secret" and paste them below.
# 3. Add "http://localhost:8080/callback" to your "Authorized redirect URLs"
# 4. Run this script!
# ==============================================================================

CLIENT_ID = "YOUR_CLIENT_ID_HERE"
CLIENT_SECRET = "YOUR_CLIENT_SECRET_HERE"
REDIRECT_URI = "http://localhost:8080/callback"
PORT = 8080

class OAuthCallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)
        
        if 'code' in params:
            code = params['code'][0]
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(b"<h1>Authorization successful!</h1><p>You can close this window and return to your terminal.</p>")
            
            # Exchange the code for an access token
            print("\n[+] Received authorization code! Exchanging for access token...")
            get_access_token(code)
            
        elif 'error' in params:
            self.send_response(400)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            err = params.get('error', [''])[0]
            desc = params.get('error_description', [''])[0]
            self.wfile.write(f"<h1>Authorization failed</h1><p>{err}: {desc}</p>".encode())
            print(f"\n[-] Error: {err} - {desc}")
        
        # Stop the server after receiving the callback
        import threading
        threading.Thread(target=self.server.shutdown).start()

    def log_message(self, format, *args):
        pass # Suppress standard HTTP logs

def get_access_token(code):
    url = "https://www.linkedin.com/oauth/v2/accessToken"
    data = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET
    }).encode('utf-8')
    
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    
    try:
        with urllib.request.urlopen(req) as response:
            resp_data = json.loads(response.read().decode())
            access_token = resp_data.get('access_token')
            expires_in = resp_data.get('expires_in', 0)
            
            print(f"\n===========================================================")
            print(f"SUCCESS! Here is your token (Valid for {int(expires_in/86400)} days):")
            print(f"===========================================================\n")
            print(f"{access_token}\n")
            
            # Now fetch the user's correct numeric URN using OpenID
            print("[*] Fetching your correct numeric member ID from LinkedIn...")
            userinfo_url = "https://api.linkedin.com/v2/userinfo"
            req_info = urllib.request.Request(userinfo_url, method="GET")
            req_info.add_header('Authorization', f'Bearer {access_token}')
            
            numeric_id = ""
            try:
                with urllib.request.urlopen(req_info) as info_response:
                    info_data = json.loads(info_response.read().decode())
                    numeric_id = info_data.get('sub', '')
                    print(f"[*] Found your Member ID: {numeric_id}")
            except Exception as e:
                print(f"[-] Failed to get userinfo: {e}")

            print(f"===========================================================")
            
            # Try to automatically save it to .env
            env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
            if os.path.exists(env_path):
                with open(env_path, "r") as f:
                    content = f.read()
                
                import re
                if "LINKEDIN_ACCESS_TOKEN=" in content:
                    content = re.sub(r"LINKEDIN_ACCESS_TOKEN=.*", f"LINKEDIN_ACCESS_TOKEN={access_token}", content)
                else:
                    content += f"\nLINKEDIN_ACCESS_TOKEN={access_token}\n"
                    
                if numeric_id:
                    if "LINKEDIN_MEMBER_ID=" in content:
                        content = re.sub(r"LINKEDIN_MEMBER_ID=.*", f"LINKEDIN_MEMBER_ID={numeric_id}", content)
                    else:
                        content += f"LINKEDIN_MEMBER_ID={numeric_id}\n"
                    
                with open(env_path, "w") as f:
                    f.write(content)
                print(f"[*] Automatically saved to your .env file!")
                
    except urllib.error.HTTPError as e:
        print(f"\n[-] Failed to get access token: {e.code}")
        print(e.read().decode())

def main():
    if CLIENT_ID == "YOUR_CLIENT_ID_HERE" or CLIENT_SECRET == "YOUR_CLIENT_SECRET_HERE":
        print("[-] ERROR: You must open this script and paste your CLIENT_ID and CLIENT_SECRET first!")
        return

    # Request both OpenID and social posting scopes, plus read access for historical posts
    scopes = "openid profile w_member_social r_basicprofile"
    
    auth_url = (
        f"https://www.linkedin.com/oauth/v2/authorization?"
        f"response_type=code&"
        f"client_id={CLIENT_ID}&"
        f"redirect_uri={urllib.parse.quote(REDIRECT_URI)}&"
        f"state=my_random_secure_state_12345&"
        f"scope={urllib.parse.quote(scopes)}"
    )
    
    print("\n[*] Starting local server on port 8080 to receive LinkedIn callback...")
    server = HTTPServer(('localhost', PORT), OAuthCallbackHandler)
    
    print(f"[*] Opening your browser to authorize the app...")
    webbrowser.open(auth_url)
    
    print("[*] Waiting for you to click 'Allow' in your browser...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    print("[*] Done.")

if __name__ == "__main__":
    main()
