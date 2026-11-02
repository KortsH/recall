package app.recall.mobile;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.Set;

public class InterfaceLanguageTest {
    @Test public void languageTagsFallbackAndUnknownCodesAreSafe() {
        Set<String> codes = Set.of("en", "et", "pt-BR");
        assertEquals("et", InterfaceLanguage.choose(codes, "ET-ee"));
        assertEquals("pt-BR", InterfaceLanguage.choose(codes, "pt-br"));
        assertEquals("en", InterfaceLanguage.choose(codes, "../../secret"));
        assertEquals("en", InterfaceLanguage.choose(codes, null));
    }
}
