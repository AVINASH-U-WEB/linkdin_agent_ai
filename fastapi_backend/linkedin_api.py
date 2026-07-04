import os
import requests


def get_user_urn(access_token: str) -> str:
    """
    Returns the LinkedIn author URN by fetching the user's profile ID dynamically using their access token.
    Falls back to .env if the request fails (for legacy/admin fallback).
    """
    try:
        headers = {
            "Authorization": f"Bearer {access_token}",
            "X-Restli-Protocol-Version": "2.0.0"
        }
        res = requests.get("https://api.linkedin.com/v2/userinfo", headers=headers, timeout=10)
        if res.status_code == 200:
            user_data = res.json()
            if "sub" in user_data:
                return f"urn:li:person:{user_data['sub']}"
    except Exception as e:
        print(f"Error fetching dynamic user URN: {e}")

    # Fallback to .env
    member_id = os.getenv("LINKEDIN_MEMBER_ID", "").strip()
    if not member_id:
        raise Exception("Failed to fetch user ID dynamically and LINKEDIN_MEMBER_ID not set in .env.")
    return f"urn:li:person:{member_id}"


def create_linkedin_post(access_token: str, author_urn: str, text: str, image_bytes: bytes = None) -> dict:
    """
    Creates a post on the user's LinkedIn feed using the /v2/ugcPosts endpoint.
    If image_bytes is provided, it first uploads the image and attaches it to the post.
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0"
    }

    media_category = "NONE"
    media_array = []

    if image_bytes:
        # Step 1: Register the upload
        register_url = "https://api.linkedin.com/v2/assets?action=registerUpload"
        register_payload = {
            "registerUploadRequest": {
                "recipes": ["urn:li:digitalmediaRecipe:feedshare-image"],
                "owner": author_urn,
                "serviceRelationships": [{"relationshipType": "OWNER", "identifier": "urn:li:userGeneratedContent"}]
            }
        }
        reg_res = requests.post(register_url, headers=headers, json=register_payload)
        if reg_res.status_code not in (200, 201):
            raise Exception(f"Failed to register image upload: {reg_res.status_code} - {reg_res.text}")
        
        reg_data = reg_res.json()
        upload_mech = reg_data["value"]["uploadMechanism"]["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]
        upload_url = upload_mech["uploadUrl"]
        asset_urn = reg_data["value"]["asset"]

        # Step 2: Upload the actual image bytes
        upload_headers = {"Authorization": f"Bearer {access_token}"} # Content-Type must not be application/json here
        put_res = requests.put(upload_url, headers=upload_headers, data=image_bytes)
        if put_res.status_code not in (200, 201):
            raise Exception(f"Failed to upload image binary: {put_res.status_code} - {put_res.text}")

        media_category = "IMAGE"
        media_array = [{
            "status": "READY",
            "description": {"text": "Image attached from AI dashboard"},
            "media": asset_urn
        }]

    # Step 3: Create the final post
    url = "https://api.linkedin.com/v2/ugcPosts"
    payload = {
        "author": author_urn,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": text},
                "shareMediaCategory": media_category
            }
        },
        "visibility": {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
        }
    }
    
    if media_array:
        payload["specificContent"]["com.linkedin.ugc.ShareContent"]["media"] = media_array

    response = requests.post(url, headers=headers, json=payload)
    if response.status_code in (200, 201):
        return response.json() 
    else:
        raise Exception(f"Failed to create LinkedIn Post: {response.status_code} - {response.text}")
