# Firestore Security Rules Setup

The "Missing or insufficient permissions" error occurs because Firestore security rules need to be configured.

## Quick Fix

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `capitalos-a24f7`
3. Navigate to **Firestore Database** → **Rules** tab
4. Replace the existing rules with the content from `firestore.rules` file in this project
5. Click **Publish**

## Alternative: Using Firebase CLI

If you have Firebase CLI installed:

```bash
# Install Firebase CLI (if not installed)
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase (if not already done)
firebase init firestore

# Deploy rules
firebase deploy --only firestore:rules
```

## Rules Explanation

The rules allow:
- ✅ Authenticated users to read/write only their own data under `/users/{userId}/`
- ✅ All subcollections (netWorthItems, transactions, snapshots, etc.) are protected
- ❌ Users cannot access other users' data
- ❌ Unauthenticated users cannot access any data

## Testing

After deploying the rules:
1. Sign in to your app
2. Try importing a backup file again
3. The import should now work without permission errors

