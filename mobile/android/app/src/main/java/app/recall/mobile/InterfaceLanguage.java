package app.recall.mobile;

import java.util.Locale;
import java.util.Set;

/** Locale selection only; protocol values and quiz content are never translated. */
public final class InterfaceLanguage {
    private InterfaceLanguage() {}
    public static String choose(Set<String> available, String requested) {
        String normal = requested == null ? "" : requested.toLowerCase(Locale.ROOT);
        for (String code : available) if (code.equalsIgnoreCase(normal)) return code;
        String base = normal.split("-")[0];
        for (String code : available) if (code.equalsIgnoreCase(base)) return code;
        return "en";
    }
}
