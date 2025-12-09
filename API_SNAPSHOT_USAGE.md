# Snapshot API Usage Guide

## Overview

The Snapshot API allows you to programmatically create a snapshot of a user's net worth by calculating the total values of each category in CHF.

## Endpoint

**URL:** `https://your-domain.vercel.app/api/snapshot/create`  
**Method:** `POST`  
**Content-Type:** `application/json`

## Authentication

No authentication is required for this endpoint. However, you should secure it in production by:
- Adding API key authentication
- Implementing rate limiting
- Restricting access to specific IPs

## Request

### Request Body (JSON)

```json
{
  "uid": "user-firebase-uid"
}
```

### Query Parameters (Alternative)

You can also pass the `uid` as a query parameter:

```
POST /api/snapshot/create?uid=user-firebase-uid
```

### Parameters

- **uid** (required): The Firebase user ID for which to create the snapshot

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Snapshot created successfully",
  "snapshot": {
    "date": "2024-01-15",
    "timestamp": 1705276799000,
    "total": 125000.50,
    "categories": {
      "Cash": 5000.00,
      "Bank Accounts": 15000.00,
      "Retirement Funds": 30000.00,
      "Index Funds": 25000.00,
      "Stocks": 20000.00,
      "Commodities": 5000.00,
      "Crypto": 15000.00,
      "Real Estate": 10000.00,
      "Depreciating Assets": 5000.50
    }
  }
}
```

### Error Responses

#### 400 Bad Request - Missing User ID

```json
{
  "error": "User ID (uid) is required. Provide it in the request body as { \"uid\": \"your-user-id\" } or as a query parameter ?uid=your-user-id"
}
```

#### 405 Method Not Allowed

```json
{
  "error": "Method not allowed. Use POST."
}
```

#### 500 Internal Server Error

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

## How It Works

1. **Loads User Data**: Fetches net worth items and transactions from Firestore
2. **Fetches Current Prices**:
   - Crypto prices from CryptoCompare API
   - Stock/Index Fund/Commodity prices from Yahoo Finance via RapidAPI (if API key is configured)
   - USD to CHF exchange rate from CryptoCompare
   - General exchange rates from ExchangeRate-API
3. **Calculates Category Totals**: 
   - For Crypto: Uses current USD prices, converts to CHF
   - For Stocks/Index Funds/Commodities: Uses current USD prices if available, otherwise falls back to transaction-based calculation
   - For other categories: Uses transaction-based calculation
4. **Creates Snapshot**: Generates a snapshot with all category totals in CHF
5. **Saves to Firestore**: Stores the snapshot in the user's `snapshots` collection

## Example Usage

### Using cURL

```bash
curl -X POST https://your-domain.vercel.app/api/snapshot/create \
  -H "Content-Type: application/json" \
  -d '{"uid": "user-firebase-uid"}'
```

### Using JavaScript (Fetch API)

```javascript
async function createSnapshot(uid) {
  try {
    const response = await fetch('https://your-domain.vercel.app/api/snapshot/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uid }),
    });

    const data = await response.json();

    if (data.success) {
      console.log('Snapshot created:', data.snapshot);
      return data.snapshot;
    } else {
      console.error('Error:', data.error);
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Failed to create snapshot:', error);
    throw error;
  }
}

// Usage
createSnapshot('user-firebase-uid')
  .then(snapshot => {
    console.log('Total net worth:', snapshot.total);
  })
  .catch(error => {
    console.error('Error:', error);
  });
```

### Using Python (requests)

```python
import requests
import json

def create_snapshot(uid, api_url):
    url = f"{api_url}/api/snapshot/create"
    payload = {"uid": uid}
    headers = {"Content-Type": "application/json"}
    
    response = requests.post(url, json=payload, headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        if data.get("success"):
            print(f"Snapshot created: {data['snapshot']}")
            return data["snapshot"]
        else:
            raise Exception(data.get("error", "Unknown error"))
    else:
        raise Exception(f"API returned {response.status_code}: {response.text}")

# Usage
snapshot = create_snapshot("user-firebase-uid", "https://your-domain.vercel.app")
print(f"Total net worth: {snapshot['total']}")
```

## Environment Variables

The API function requires the following environment variables to be set in Vercel:

1. **FIREBASE_SERVICE_ACCOUNT** (required): JSON string of Firebase service account credentials
   - Go to Firebase Console → Project Settings → Service Accounts
   - Generate a new private key
   - Copy the entire JSON content
   - In Vercel, add it as an environment variable (the entire JSON as a string)

2. **VITE_RAPIDAPI_KEY** (optional): RapidAPI key for fetching stock prices
   - Only needed if users haven't configured their own RapidAPI key in settings
   - If not set, stock prices will fall back to transaction-based calculations

## Setup Instructions

### 1. Deploy to Vercel

The API route will be automatically detected and deployed when you push to your repository.

### 2. Set Environment Variables

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add `FIREBASE_SERVICE_ACCOUNT` with your Firebase service account JSON
3. (Optional) Add `VITE_RAPIDAPI_KEY` if you want a fallback RapidAPI key

### 3. Test the API

```bash
# Replace with your actual Vercel URL and user ID
curl -X POST https://your-app.vercel.app/api/snapshot/create \
  -H "Content-Type: application/json" \
  -d '{"uid": "test-user-id"}'
```

## Notes

- Snapshots are stored with the date (YYYY-MM-DD) as the document ID
- If a snapshot for the current date already exists, it will be overwritten
- The snapshot includes all categories, even if they have zero value
- All values are calculated and stored in CHF
- The API fetches real-time prices for crypto and stocks (if API keys are configured)
- The function handles missing prices gracefully by falling back to transaction-based calculations

## Troubleshooting

### Error: "Firebase Admin initialization failed"
- Check that `FIREBASE_SERVICE_ACCOUNT` environment variable is set correctly
- Ensure the service account JSON is valid and properly escaped

### Error: "User ID (uid) is required"
- Make sure you're passing the `uid` in the request body or as a query parameter
- Verify the `uid` is a valid string

### Stock prices not updating
- Check if the user has configured a RapidAPI key in their settings
- Verify `VITE_RAPIDAPI_KEY` is set if using fallback
- Check RapidAPI rate limits

### Snapshot values seem incorrect
- Verify that the user has net worth items and transactions in Firestore
- Check that exchange rates are being fetched correctly
- Review the API logs in Vercel for detailed error messages

