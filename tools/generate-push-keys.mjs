// Explicit operator utility: values go to your terminal only. Never commit the private key.
import webPush from 'web-push'
const {publicKey,privateKey}=webPush.generateVAPIDKeys()
console.log(`WEB_PUSH_VAPID_PUBLIC_KEY=${publicKey}\nWEB_PUSH_VAPID_PRIVATE_KEY=${privateKey}`)
