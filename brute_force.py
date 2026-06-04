import json
import urllib.request
import urllib.error

url = "https://p01--walletyapi--h4qhqgzm488z.code.run/account/verify"
headers = {
    "Content-Type": "application/json",
    "X-Api-Key": "d6e9b320-3c4b-4804-a020-ab201726b84c"
}

# Industry variations for South African national document validation schemas
test_documents = [
    "ID_CARD", "ID", "NATIONAL_ID", "ZA_ID", "IDENTITY_CARD", "NATIONAL_IDENTITY_CARD",
    "GREEN_BOOK", "BOOK", "GREEN_ID_BOOK", "ZA_BOOK", "IDENTITY_BOOK"
]

base_payload = {
    "whatsApp_number": "27821112222",
    "images": {"id_image": None, "selfie_image": None},
    "user_declared": {"identity_number": "9201155124083", "first_names": "SIBO", "surname": "NDLOVU"},
    "ocr_extracted": {"identity_number": "9201155124083", "first_names": "SIBO", "surname": "NDLOVU", "dob": "1992-01-15", "gender": "male", "citizenship_status": "citizen", "passport_metadata": None},
    "_meta": {"identity_match": True}
}

print(" Scanning API validation layer for accepted document types...\n")

for doc_type in test_documents:
    payload = base_payload.copy()
    payload["document_type"] = doc_type
    
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            print(f" FOUND WORKING VALUE! -> \"{doc_type}\" Status: 200 Response: {res_body}")
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8").strip()
        if "Invalid document type" not in err_msg:
            print(f" VALID DOCUMENT TYPE KEY! -> \"{doc_type}\" (Passed validation, but returned error: {err_msg})")
        else:
            print(f" Rejected: \"{doc_type}\"")
    except Exception as err:
        print(f" Connection error with \"{doc_type}\": {err}")
