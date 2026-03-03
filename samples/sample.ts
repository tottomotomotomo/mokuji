// # Types
interface User {
    name: string;
    age: number;
}

// ## Interfaces
interface Config {
    debug: boolean;
}

/** # Services */
class UserService {
    /** ## Public Methods */
    getUser(): User {
        return { name: "test", age: 20 };
    }

    /** ### Helper */
    private validate(): boolean {
        return true;
    }
}

// # Utilities
function helper(): void {}
