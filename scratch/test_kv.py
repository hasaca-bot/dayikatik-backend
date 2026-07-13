import urllib.request
import json

bot_token = "8784630979:AAFJk_fg4EwNVjnAErSaEIoD18PqWufMPKg"
chat_id = "-5100786193"

try:
    # 1. Send message
    url_send = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    req_data = json.dumps({"chat_id": chat_id, "text": "RESERVATIONS_DATA: []"}).encode('utf-8')
    req = urllib.request.Request(url_send, data=req_data, headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=5) as response:
        msg_data = json.loads(response.read().decode('utf-8'))
        message_id = msg_data["result"]["message_id"]
        print("Sent Message ID:", message_id)
        
    # 2. Pin message
    url_pin = f"https://api.telegram.org/bot{bot_token}/pinChatMessage"
    req_data = json.dumps({"chat_id": chat_id, "message_id": message_id, "disable_notification": True}).encode('utf-8')
    req = urllib.request.Request(url_pin, data=req_data, headers={'Content-Type': 'application/json'}, method='POST')
    urllib.request.urlopen(req, timeout=5)
    print("Pinned message.")
    
    # 3. Get Chat and read pinned message
    url_get = f"https://api.telegram.org/bot{bot_token}/getChat?chat_id={chat_id}"
    with urllib.request.urlopen(url_get, timeout=5) as response:
        chat_data = json.loads(response.read().decode('utf-8'))
        pinned_msg = chat_data.get("result", {}).get("pinned_message", {})
        print("Pinned Message from getChat:")
        print(json.dumps(pinned_msg, indent=2))
        
    # 4. Edit message
    url_edit = f"https://api.telegram.org/bot{bot_token}/editMessageText"
    req_data = json.dumps({"chat_id": chat_id, "message_id": message_id, "text": "RESERVATIONS_DATA: [{\"id\":1}]"}).encode('utf-8')
    req = urllib.request.Request(url_edit, data=req_data, headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=5) as response:
        edit_data = json.loads(response.read().decode('utf-8'))
        print("Edit Message Success:", edit_data)
        
    # 5. Clean up: unpin and delete message
    url_unpin = f"https://api.telegram.org/bot{bot_token}/unpinChatMessage"
    req_data = json.dumps({"chat_id": chat_id, "message_id": message_id}).encode('utf-8')
    req = urllib.request.Request(url_unpin, data=req_data, headers={'Content-Type': 'application/json'}, method='POST')
    urllib.request.urlopen(req, timeout=5)
    print("Unpinned message.")
    
    url_delete = f"https://api.telegram.org/bot{bot_token}/deleteMessage"
    req_data = json.dumps({"chat_id": chat_id, "message_id": message_id}).encode('utf-8')
    req = urllib.request.Request(url_delete, data=req_data, headers={'Content-Type': 'application/json'}, method='POST')
    urllib.request.urlopen(req, timeout=5)
    print("Deleted message.")

except Exception as e:
    print("Error:", e)
