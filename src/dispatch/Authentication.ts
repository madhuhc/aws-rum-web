import { CognitoIdentityClient } from './CognitoIdentityClient';
import { Config } from '../orchestration/Orchestration';
import { Credentials } from '@aws-sdk/types';
import { FetchHttpHandler } from '@aws-sdk/fetch-http-handler';
import { StsClient } from './StsClient';
import { CRED_KEY } from '../utils/constants';

export class Authentication {
    private cognitoIdentityClient: CognitoIdentityClient;
    private stsClient: StsClient;
    private config: Config;

    constructor(config: Config) {
        const region: string = config.identityPoolId.split(':')[0];
        this.config = config;
        this.stsClient = new StsClient({
            fetchRequestHandler: new FetchHttpHandler(),
            region
        });
        this.cognitoIdentityClient = new CognitoIdentityClient({
            fetchRequestHandler: new FetchHttpHandler(),
            region
        });
    }

    /**
     * A credential provider which provides AWS credentials for an anonymous
     * (guest) user. These credentials are retrieved from the first successful
     * provider in a chain.
     *
     * Credentials are stored in and retrieved from localStorage. This prevents the client from having to
     * re-authenticate every time the client loads, which (1) improves the performance of the RUM web client and (2)
     * reduces the load on AWS services Cognito and STS.
     *
     * While storing credentials in localStorage puts the cookie at greater risk of being leaked through an
     * XSS attack, there is no impact if the credentials were to be leaked. This is because (1) the identity pool ID
     * and role ARN are public and (2) the credentials are for an anonymous (guest) user.
     *
     * Regarding (1), the identity pool ID and role ARN are, by necessity, public. These identifiers are shipped with
     * each application as part of Cognito's Basic (Classic) authentication flow. The identity pool ID and role ARN
     * are not secret.
     *
     * Regarding (2), the authentication chain implemented in this file only supports anonymous (guest)
     * authentication. When the Cognito authentication flow is executed, {@code AnonymousCognitoCredentialsProvider}
     * does not communicate with a login provider such as Amazon, Facebook or Google. Instead, it relies on (a) the
     * identity pool supporting unauthenticated identities and (b) the IAM role policy enabling login through the
     * identity pool. If the identity pool does not support unauthenticated identities, this authentication chain
     * will not succeed.
     *
     * Taken together, (1) and (2) mean that if these temporary credentials were to be leaked, the leaked credentials
     * would not allow a bad actor to gain access to anything which they did not already have public access to.
     *
     * Implements CredentialsProvider = Provider<Credentials>
     */
    public ChainAnonymousCredentialsProvider = async (): Promise<Credentials> => {
        return this.AnonymousCookieCredentialsProvider().catch(
            this.AnonymousCognitoCredentialsProvider
        );
    };

    /**
     * Provides credentials for an anonymous (guest) user. These credentials are read from a cookie.
     *
     * Implements CredentialsProvider = Provider<Credentials>
     */
    private AnonymousCookieCredentialsProvider = async (): Promise<Credentials> => {
        return new Promise<Credentials>((resolve, reject) => {
            let credentials;
            try {
                credentials = JSON.parse(localStorage.getItem(CRED_KEY));
            } catch (e) {
                // Error retrieving, decoding or parsing the cred string -- abort
                reject();
            }
            // The expiration property of Credentials has a date type. Because the date was serialized as a string,
            // we need to convert it back into a date, otherwise the AWS SDK signing middleware
            // (@aws-sdk/middleware-signing) will throw an exception and no credentials will be returned.
            credentials.expiration = new Date(credentials.expiration);
            if (credentials.expiration < new Date()) {
                // The credentials have expired.
                reject();
            }
            resolve(credentials);
        });
    };

    /**
     * Provides credentials for an anonymous (guest) user. These credentials are retrieved from Cognito's basic
     * (classic) authflow.
     *
     * See https://docs.aws.amazon.com/cognito/latest/developerguide/authentication-flow.html
     *
     * Implements CredentialsProvider = Provider<Credentials>
     */
    private AnonymousCognitoCredentialsProvider = async (): Promise<Credentials> => {
        return this.cognitoIdentityClient
            .getId({
                IdentityPoolId: this.config.identityPoolId as string
            })
            .then((getIdResponse) =>
                this.cognitoIdentityClient.getOpenIdToken(getIdResponse)
            )
            .then((getOpenIdTokenResponse) =>
                this.stsClient.assumeRoleWithWebIdentity({
                    RoleArn: this.config.guestRoleArn as string,
                    RoleSessionName: 'cwr',
                    WebIdentityToken: getOpenIdTokenResponse.Token
                })
            )
            .then((credentials) => {
                try {
                    localStorage.setItem(CRED_KEY, JSON.stringify(credentials));
                } catch (e) {
                    // Ignore
                }

                return credentials;
            });
    };
}
