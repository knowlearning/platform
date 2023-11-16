// TODO: integrate this script with the core

import dns from 'dns'
import acme from 'acme-client'
import { encrypt, generateKeyPair } from './encryption.js'

const PUBLIC_ENCRYPTION_KEY = '7DZJc/c8HLpvFS1xiEyDqPlv0Oey/OA0mOiLaeNXbg8='

const {
  MODE,
  INSECURE_DEVELOPMENT_CERT,
  INSECURE_DEVELOPMENT_KEY
} = process.env

const directoryUrl = MODE === 'local' ? acme.directory.letsencrypt.staging
                                      : acme.directory.letsencrypt.production

const client = new acme.Client({
  directoryUrl,
  accountKey: await acme.crypto.createPrivateKey()
})

const accountPromise = client.createAccount({
    termsOfServiceAgreed: true,
    contact: ['mailto:admin@knowlearning.org']
})

async function ACMEChallengeAndResponse(domain) {
  if (MODE === 'local') return { cert: INSECURE_DEVELOPMENT_CERT, key: INSECURE_DEVELOPMENT_KEY}

  await accountPromise

  const [key, csr] = await acme.crypto.createCsr({ commonName: domain })

  const cert = await client.auto({
      csr,
      email: 'admin@knowlearning.org',
      termsOfServiceAgreed: true,
      challengeCreateFn: async (authorization, challenge, keyAuthorization) => {
        if (challenge.type === 'http-01') {
          tlsChallenge.HTTP_01_Challenge_Token = challenge.token
          tlsChallenge.HTTP_01_Challenge_Response = keyAuthorization
          //  TODO: consider await here to give time for serve to get challenge data update
        }
        else if (challenge.type === 'dns-01') {
          const txtRecordDomain = domain.startsWith('*.') ? domain.slice(2) : domain
          const challengeDomain = `_acme-challenge.${txtRecordDomain}`
          console.log('Set TXT record for', challengeDomain, 'To:', keyAuthorization)
          //  TODO: set time limit...
          while (true) {
            await new Promise(r => setTimeout(r, 1000))
            const [[txtRecord]] = await dns.promises.resolveTxt(challengeDomain).catch(() => [[]])
            if (txtRecord === keyAuthorization) {
              console.log('VERFIED!')
              break
            }
            else console.log('CHECKING...')
          }
        }
      },
      challengeRemoveFn: async (authz, challenge, keyAuthorization) => {
        // TODO: mark existing challenge as fullfilled or failed
        // delete tlsChallenges[domain]
      }
  })

  const myKeyPair = generateKeyPair()
  const encryptedKey = encrypt(myKeyPair.secretKey, Buffer.from(PUBLIC_ENCRYPTION_KEY, 'base64'), key)

  //  TODO: consider uploading rather than writing into scope
  //  TODO: write this into a scope
  return {
    cert: cert.toString(),
    key: Buffer.from(encryptedKey).toString('base64'),
    publicKey: Buffer.from(myKeyPair.publicKey).toString('base64')
  }
}


console.log(await ACMEChallengeAndResponse('*.knowlearning.systems'))
// TODO: periodically renew certs