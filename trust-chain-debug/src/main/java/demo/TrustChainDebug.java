package demo;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.nimbusds.openid.connect.sdk.federation.entities.EntityID;
import com.nimbusds.openid.connect.sdk.federation.trust.ResolveException;
import com.nimbusds.openid.connect.sdk.federation.trust.TrustChain;
import com.nimbusds.openid.connect.sdk.federation.trust.TrustChainResolver;
import com.nimbusds.openid.connect.sdk.federation.trust.TrustChainSet;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.HashMap;
import java.util.Map;

/**
 * Reproduces Authlete's OpenID Federation trust-chain resolution with the same Nimbus SDK:
 * resolves the chain from an RP up to a Trust Anchor and prints where it breaks. TLS verification
 * is disabled so the self-signed Trust Anchor cert (:8080) doesn't block the fetch.
 *
 * Usage: TrustChainDebug [rpEntityId] [trustAnchorEntityId]
 */
public class TrustChainDebug {

    private static final String DEFAULT_RP = "http://localhost:8092/agents/invoice-reconciler";
    private static final String DEFAULT_TA = "https://localhost:8080";

    public static void main(String[] args) throws Exception {
        String rp = args.length > 0 ? args[0] : DEFAULT_RP;
        String ta = args.length > 1 ? args[1] : DEFAULT_TA;
        System.out.println("RP = " + rp);
        System.out.println("TA = " + ta + "\n");
        trustAllTls();

        printEntityConfig("RP leaf", rp + "/.well-known/openid-federation");
        printEntityConfig("Trust Anchor", ta + "/.well-known/openid-federation");

        Map<EntityID, JWKSet> trustAnchors = new HashMap<>();
        trustAnchors.put(new EntityID(ta), null); // null => resolver fetches the TA's keys from its config
        TrustChainResolver resolver = new TrustChainResolver(trustAnchors, 10_000, 10_000);

        try {
            TrustChainSet chains = resolver.resolveTrustChains(new EntityID(rp));
            System.out.println("SUCCESS: resolved " + chains.size() + " chain(s)");
            for (TrustChain chain : chains) System.out.println("  " + chain);
        } catch (ResolveException e) {
            System.out.println("FAILED: " + e.getMessage());
            if (e.getCauses() != null) for (Throwable t : e.getCauses()) {
                System.out.println("  cause: " + t);
                if (t.getCause() != null) System.out.println("    " + t.getCause());
            }
        }
    }

    private static void printEntityConfig(String label, String url) {
        try {
            JWTClaimsSet c = SignedJWT.parse(httpGet(url)).getJWTClaimsSet();
            System.out.println(label + " (" + url + ")");
            System.out.println("  iss = " + c.getIssuer());
            System.out.println("  sub = " + c.getSubject());
            System.out.println("  authority_hints = " + c.getClaim("authority_hints") + "\n");
        } catch (Exception e) {
            System.out.println(label + ": ERROR " + e + "\n");
        }
    }

    private static String httpGet(String url) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(10_000);
        con.setReadTimeout(10_000);
        int code = con.getResponseCode();
        String body = new String((code < 400 ? con.getInputStream() : con.getErrorStream()).readAllBytes()).trim();
        if (code >= 400) throw new RuntimeException("HTTP " + code + ": " + body);
        return body;
    }

    /** Accept the self-signed localhost TA cert. DEV ONLY. */
    private static void trustAllTls() throws Exception {
        TrustManager[] all = {new X509TrustManager() {
            public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            public void checkClientTrusted(X509Certificate[] x, String a) { }
            public void checkServerTrusted(X509Certificate[] x, String a) { }
        }};
        SSLContext sc = SSLContext.getInstance("TLS");
        sc.init(null, all, new SecureRandom());
        HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
        HttpsURLConnection.setDefaultHostnameVerifier((h, s) -> true);
    }
}
