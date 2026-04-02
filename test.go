package main

// # Data Models

// ## User Struct
type User struct {
	Name string
	Age  int
}

/* # Services */

/* ## User Service */
type UserService struct{}

// ### Public Methods
func (s *UserService) GetUser() *User {
	return &User{Name: "test", Age: 20}
}

// ### Private Helpers
func (s *UserService) validate() bool {
	return true
}

// # Utilities
func helper() {}
