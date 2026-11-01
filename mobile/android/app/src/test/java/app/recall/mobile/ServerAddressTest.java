package app.recall.mobile;
import org.junit.Test;
import static org.junit.Assert.*;
public class ServerAddressTest {
    @Test public void normalisesHttpsOrigin(){assertEquals("https://example.test:8445/",ServerAddress.normalise(" https://example.test:8445 "));}
    @Test public void rejectsCredentialsAndNonHttps(){for(String value:new String[]{"http://example.test","javascript:alert(1)","https://user:password@example.test","https://example.test/path","https://example.test/?key=value"}){try{ServerAddress.normalise(value);fail(value);}catch(IllegalArgumentException expected){}}}
    @Test public void restrictsNavigationToConfiguredOrigin(){assertTrue(ServerAddress.sameOrigin("https://example.test/","https://example.test:443/api/decks"));assertFalse(ServerAddress.sameOrigin("https://example.test/","https://example.test.attacker.invalid/"));assertFalse(ServerAddress.sameOrigin("https://example.test/","https://example.test:8445/"));assertFalse(ServerAddress.sameOrigin("https://example.test/","file:///etc/passwd"));}
}
