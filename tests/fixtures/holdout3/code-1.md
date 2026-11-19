# Rust parser

```rust
pub fn parse_field_0(input: &str) -> Result<(u32, &str), ParseError> {
    let (num, rest) = input.split_once(':').ok_or(ParseError::MissingColon(0))?;
    let value = num.trim().parse::<u32>().map_err(|e| ParseError::BadNumber(e.to_string()))?;
    Ok((value, rest))
}

pub fn parse_field_1(input: &str) -> Result<(u32, &str), ParseError> {
    let (num, rest) = input.split_once(':').ok_or(ParseError::MissingColon(1))?;
    let value = num.trim().parse::<u32>().map_err(|e| ParseError::BadNumber(e.to_string()))?;
    Ok((value, rest))
}

pub fn parse_field_2(input: &str) -> Result<(u32, &str), ParseError> {
    let (num, rest) = input.split_once(':').ok_or(ParseError::MissingColon(2))?;
    let value = num.trim().parse::<u32>().map_err(|e| ParseError::BadNumber(e.to_string()))?;
    Ok((value, rest))
}

pub fn parse_field_3(input: &str) -> Result<(u32, &str), ParseError> {
    let (num, rest) = input.split_once(':').ok_or(ParseError::MissingColon(3))?;
    let value = num.trim().parse::<u32>().map_err(|e| ParseError::BadNumber(e.to_string()))?;
    Ok((value, rest))
}

pub fn parse_field_4(input: &str) -> Result<(u32, &str), ParseError> {
    let (num, rest) = input.split_once(':').ok_or(ParseError::MissingColon(4))?;
    let value = num.trim().parse::<u32>().map_err(|e| ParseError::BadNumber(e.to_string()))?;
    Ok((value, rest))
}

pub fn parse_field_5(input: &str) -> Result<(u32, &str), ParseError> {
    let (num, rest) = input.split_once(':').ok_or(ParseError::MissingColon(5))?;
    let value = num.trim().parse::<u32>().map_err(|e| ParseError::BadNumber(e.to_string()))?;
    Ok((value, rest))
}

pub fn parse_field_6(input: &str) -> Result<(u32, &str), ParseError> {
    let (num, rest) = input.split_once(':').ok_or(ParseError::MissingColon(6))?;
    let value = num.trim().parse::<u32>().map_err(|e| ParseError::BadNumber(e.to_string()))?;
    Ok((value, rest))
}

pub fn parse_field_7(input: &str) -> Result<(u32, &str), ParseError> {
    let (num, rest) = input.split_once(':').ok_or(ParseError::MissingColon(7))?;
    let value = num.trim().parse::<u32>().map_err(|e| ParseError::BadNumber(e.to_string()))?;
    Ok((value, rest))
}
```
