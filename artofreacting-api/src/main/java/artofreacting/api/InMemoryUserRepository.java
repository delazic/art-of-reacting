package artofreacting.api;

import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;

@Repository
class InMemoryUserRepository implements UserRepository {
    private final ConcurrentHashMap<String, User> users = new ConcurrentHashMap<>();

    @Override
    public boolean saveIfAbsent(User user) {
        return users.putIfAbsent(normalize(user.username()), user) == null;
    }

    @Override
    public List<User> findAll() {
        return List.copyOf(users.values());
    }

    private static String normalize(String username) {
        return username.toLowerCase(Locale.ROOT);
    }
}
