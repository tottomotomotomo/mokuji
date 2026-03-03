# # Data Models
class User:
    name: str
    age: int

# ## User Class
class UserModel:
    def __init__(self, name: str, age: int):
        self.name = name
        self.age = age

# # Services

# ## User Service
class UserService:
    # ### Public Methods
    def get_user(self) -> UserModel:
        return UserModel("test", 20)

    # ### Private Helpers
    def _validate(self) -> bool:
        return True

# # Utilities
def helper() -> None:
    pass
